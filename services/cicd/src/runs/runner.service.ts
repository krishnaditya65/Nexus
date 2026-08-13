import { Injectable, Logger } from '@nestjs/common';
import { spawn } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import * as yaml from 'js-yaml';
import { withTenant } from '../db/pool';
import { LibraryService } from '../library/library.service';
import { JobBrokerService } from '../runners/job-broker.service';
import { RunnersService } from '../runners/runners.service';

interface PipelineStep {
  name: string;
  run?: string;
  image?: string;
  taskGroup?: string; // references a Pipelines Library task group by name — expanded inline before execution
  approval?: boolean; // manual approval gate — halts the whole run until approve()/reject() is called on this step
  runsOn?: string; // a runner label — routes this step to a self-hosted/BYO agent instead of local docker
}

interface PipelineDefinition {
  image?: string; // default image for steps that don't specify their own
  steps: PipelineStep[];
  variableGroups?: string[]; // Pipelines Library variable group names — resolved and injected as step env vars
  secureFiles?: string[]; // Pipelines Library secure file names — materialized into the workspace before steps run
}

const DEFAULT_IMAGE = 'node:20-alpine';

function runCommand(
  command: string,
  args: string[],
  cwd?: string,
  env?: NodeJS.ProcessEnv,
): Promise<{ code: number; output: string }> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, env: env ? { ...process.env, ...env } : undefined });
    let output = '';
    child.stdout.on('data', (d) => (output += d.toString()));
    child.stderr.on('data', (d) => (output += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, output }));
    child.on('error', (err) => resolve({ code: 1, output: output + `\n${err.message}` }));
  });
}

/**
 * Executes a pipeline's steps as real `docker run` containers — each step
 * is an isolated container invocation against a workspace directory the
 * repo was cloned into, the same isolation model real CI runners (GitHub
 * Actions, GitLab Runner) use, not a simulated/in-process step executor.
 * Requires the Docker daemon to be reachable from wherever this service
 * runs (mount /var/run/docker.sock in the container deployment — see
 * README.md for the docker-compose caveat this implies).
 */
@Injectable()
export class RunnerService {
  private readonly logger = new Logger(RunnerService.name);

  // In-memory pause points for manual approval gates, keyed by step id —
  // execute() below `await`s on the promise stashed here and approve()/
  // reject() (called from an external HTTP request, arbitrarily later)
  // resolves it. This is the same "single in-process instance, no
  // external job queue" architecture the rest of this service already
  // assumes (RunnerService itself runs the whole pipeline synchronously
  // in one process) — a restart while a run is paused on approval loses
  // the pause point, same class of limitation as an in-flight `docker
  // run` step not surviving a restart either.
  private readonly pendingApprovals = new Map<string, (approved: boolean) => void>();

  constructor(
    private readonly library: LibraryService,
    private readonly broker: JobBrokerService,
    private readonly runners: RunnersService,
  ) {}

  async execute(tenantId: string, runId: string, repoName: string, commitRef: string, yamlDefinition: string, authorizationHeader: string) {
    await this.updateRunStatus(tenantId, runId, 'running');

    let definition: PipelineDefinition;
    try {
      definition = yaml.load(yamlDefinition) as PipelineDefinition;
    } catch (err) {
      await this.failRun(tenantId, runId, `invalid pipeline YAML: ${err}`);
      return;
    }

    const workspace = mkdtempSync(join(tmpdir(), 'nexus-cicd-'));
    const startedAt = Date.now();
    let overallSucceeded = true;

    try {
      const cloneOk = await this.cloneRepo(tenantId, repoName, commitRef, workspace, authorizationHeader);
      if (!cloneOk) {
        await this.failRun(tenantId, runId, 'failed to clone repository from git-host');
        return;
      }

      // Pipelines Library resolution — variable groups become step env
      // vars, secure files are materialized into the workspace before any
      // step runs (so a step can e.g. `cat secrets/deploy.pem`), and
      // `taskGroup:` step references are expanded inline into real steps.
      // All resolved here, in the runner, not left as unread config —
      // matching this platform's "no aggregation gateway / no dead config"
      // discipline elsewhere (dashboards, webhook secrets).
      const resolvedVars = await this.library.resolveVariableGroups(tenantId, definition.variableGroups ?? []);
      const envFlags: string[] = [];
      for (const [key, value] of Object.entries(resolvedVars)) envFlags.push('-e', `${key}=${value}`);

      for (const fileName of definition.secureFiles ?? []) {
        const contentBase64 = await this.library.resolveSecureFile(tenantId, fileName);
        if (contentBase64 === null) {
          await this.failRun(tenantId, runId, `secure file not found: ${fileName}`);
          return;
        }
        writeFileSync(join(workspace, fileName), Buffer.from(contentBase64, 'base64'));
      }

      const expandedSteps: PipelineStep[] = [];
      for (const step of definition.steps ?? []) {
        if (step.taskGroup) {
          const groupSteps = await this.library.resolveTaskGroup(tenantId, step.taskGroup);
          if (!groupSteps) {
            await this.failRun(tenantId, runId, `task group not found: ${step.taskGroup}`);
            return;
          }
          expandedSteps.push(...groupSteps);
        } else {
          expandedSteps.push(step);
        }
      }

      for (const step of expandedSteps) {
        if (step.approval) {
          const stepId = await this.startApprovalStep(tenantId, runId, step.name);
          await this.updateRunStatus(tenantId, runId, 'waiting_approval');
          const approved = await new Promise<boolean>((resolve) => {
            this.pendingApprovals.set(stepId, resolve);
          });
          if (!approved) {
            await this.completeStep(tenantId, stepId, 'failed', 'rejected by approver', 1);
            overallSucceeded = false;
            break;
          }
          await this.completeStep(tenantId, stepId, 'succeeded', 'approved', 0);
          await this.updateRunStatus(tenantId, runId, 'running');
          continue;
        }

        const stepId = await this.startStep(tenantId, runId, step.name);
        const image = step.image ?? definition.image ?? DEFAULT_IMAGE;

        if (step.runsOn) {
          // Routed to a self-hosted/BYO agent instead of local docker —
          // the agent clones the repo itself (it's a separate machine,
          // not sharing this process's workspace tmpdir), so it needs
          // repoName/commitRef, not the already-populated `workspace`
          // path below.
          await this.runners.enqueueJob(
            tenantId,
            stepId,
            runId,
            step.runsOn,
            step.name,
            step.image ?? definition.image,
            step.run ?? '',
            repoName,
            commitRef,
            authorizationHeader,
          );
          const result = await this.broker.waitFor(stepId);
          await this.completeStep(tenantId, stepId, result.status, result.log, result.exitCode);
          if (result.status !== 'succeeded') {
            overallSucceeded = false;
            break;
          }
          continue;
        }

        // `docker run --rm -v workspace:/workspace -w /workspace <env flags> <image> sh -c "<run>"`
        // — real container execution, not a shelled-out subprocess on the
        // host running this service, which would share its filesystem/deps.
        const { code, output } = await runCommand('docker', [
          'run',
          '--rm',
          '-v',
          `${workspace}:/workspace`,
          '-w',
          '/workspace',
          ...envFlags,
          image,
          'sh',
          '-c',
          step.run ?? '',
        ]);

        await this.completeStep(tenantId, stepId, code === 0 ? 'succeeded' : 'failed', output, code);
        if (code !== 0) {
          overallSucceeded = false;
          break; // fail-fast — matches how every mainstream CI system treats a non-zero step by default
        }
      }
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }

    await this.updateRunStatus(tenantId, runId, overallSucceeded ? 'succeeded' : 'failed');
    await this.meterCiMinutes(tenantId, authorizationHeader, (Date.now() - startedAt) / 60000);
  }

  /**
   * Bug fixed here: this used to embed the token as HTTP Basic auth via
   * URL userinfo (`http://x:TOKEN@host/...`), which git's http transport
   * turns into an `Authorization: Basic ...` header — but git-host's
   * auth middleware (see services/git-host/internal/auth/jwt.go's
   * FromRequest) strictly requires an `Authorization: Bearer ...` header
   * and rejects anything else outright. That meant every pipeline run
   * that actually reached this clone step had ALWAYS failed, silently,
   * since nothing had ever wired a real repo + real git-host + a real
   * triggered run together in one live test before now. Fixed by passing
   * the token via `-c http.extraHeader`, the same mechanism this
   * session's own manual git testing used against git-host throughout —
   * git sends exactly the header string given, no Basic-auth translation.
   */
  private async cloneRepo(
    tenantId: string,
    repoName: string,
    commitRef: string,
    workspace: string,
    authorizationHeader: string,
  ): Promise<boolean> {
    const gitHostUrl = process.env.GIT_HOST_URL ?? 'http://localhost:4003';
    const cloneUrl = `${gitHostUrl}/${repoName}.git`;
    const { code } = await runCommand('git', [
      '-c',
      `http.extraHeader=Authorization: ${authorizationHeader}`,
      'clone',
      '--depth',
      '1',
      '--branch',
      commitRef,
      cloneUrl,
      workspace,
    ]);
    return code === 0;
  }

  /** Reports CI runner-minutes to services/billing's usage ledger — the
   *  concrete wiring docs/ROADMAP.md's Track 3 cicd item promised for the
   *  ci_minutes metric services/billing already bills against. */
  private async meterCiMinutes(tenantId: string, authorizationHeader: string, minutes: number) {
    try {
      const billingUrl = process.env.BILLING_SERVICE_URL ?? 'http://localhost:4012';
      await fetch(`${billingUrl}/usage-events`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: authorizationHeader },
        body: JSON.stringify({ metric: 'ci_minutes', quantity: Math.max(minutes, 0.01), sourceService: 'cicd' }),
      });
    } catch (err) {
      this.logger.warn(`failed to meter ci_minutes for tenant ${tenantId}: ${err}`);
    }
  }

  private async updateRunStatus(tenantId: string, runId: string, status: string) {
    await withTenant(tenantId, (client) =>
      client.query(
        `update pipeline_runs set status = $2, completed_at = case when $2 in ('succeeded','failed') then now() else completed_at end where id = $1`,
        [runId, status],
      ),
    );
  }

  private async failRun(tenantId: string, runId: string, reason: string) {
    this.logger.error(`run ${runId} failed: ${reason}`);
    await this.updateRunStatus(tenantId, runId, 'failed');
  }

  private async startApprovalStep(tenantId: string, runId: string, stepName: string): Promise<string> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into pipeline_run_steps (tenant_id, run_id, step_name, status, is_approval_gate, started_at)
         values ($1, $2, $3, 'waiting_approval', true, now()) returning id`,
        [tenantId, runId, stepName],
      );
      return rows[0].id;
    });
  }

  /** Called from RunsController on `POST /runs/:runId/steps/:stepId/decision`.
   *  Records who decided and when regardless of outcome, then resolves the
   *  promise execute() is blocked on above. Returns false if there is no
   *  live pause point for this step — either it was never an approval gate,
   *  it was already decided, or (this process instance) never actually ran
   *  the pipeline that paused here. */
  async decideApproval(tenantId: string, stepId: string, userId: string, approved: boolean): Promise<boolean> {
    const resolve = this.pendingApprovals.get(stepId);
    if (!resolve) return false;

    const updated = await withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(
        `update pipeline_run_steps set approved_by_user_id = $2, approved_at = now()
         where id = $1 and is_approval_gate = true and status = 'waiting_approval'`,
        [stepId, userId],
      );
      return (rowCount ?? 0) > 0;
    });
    if (!updated) return false;

    this.pendingApprovals.delete(stepId);
    resolve(approved);
    return true;
  }

  private async startStep(tenantId: string, runId: string, stepName: string): Promise<string> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into pipeline_run_steps (tenant_id, run_id, step_name, status, started_at)
         values ($1, $2, $3, 'running', now()) returning id`,
        [tenantId, runId, stepName],
      );
      return rows[0].id;
    });
  }

  private async completeStep(tenantId: string, stepId: string, status: string, log: string, exitCode: number) {
    await withTenant(tenantId, (client) =>
      client.query(
        `update pipeline_run_steps set status = $2, log = $3, exit_code = $4, completed_at = now() where id = $1`,
        [stepId, status, log, exitCode],
      ),
    );
  }
}
