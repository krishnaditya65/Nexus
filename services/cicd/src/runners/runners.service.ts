import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { withTenant } from '../db/pool';
import { JobBrokerService } from './job-broker.service';
import { decodeToken, encodeToken, generateRawSecret, hashSecret, verifySecret } from './token.util';

@Injectable()
export class RunnersService {
  constructor(private readonly broker: JobBrokerService) {}

  async register(tenantId: string, name: string, labels: string[]) {
    if (!name.trim()) throw new BadRequestException('name is required');
    const runnerId = randomUUID();
    const rawSecret = generateRawSecret();
    const tokenHash = await hashSecret(rawSecret);
    const runner = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into runners (id, tenant_id, name, labels, token_hash) values ($1, $2, $3, $4, $5) returning id, name, labels, status, created_at`,
        [runnerId, tenantId, name, labels, tokenHash],
      );
      return rows[0];
    });
    // The only point the raw token is ever returned — same shown-once
    // discipline as api-platform's webhook secrets and this session's MFA
    // recovery codes. Losing it means re-registering, not "resetting" it.
    return { ...runner, token: encodeToken(tenantId, runnerId, rawSecret) };
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, name, labels, status, last_heartbeat_at, created_at from runners where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from runners where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('runner not found');
      return { status: 'deleted' };
    });
  }

  /** Called from RunnerService.execute() (the pipeline executor) when it
   *  hits a `runsOn:`-tagged step — enqueues real work for an external
   *  agent to pick up, using the step's own id as the job id (see this
   *  migration's docblock for why). The auth header is stashed in the
   *  in-memory broker, not written here, so it never touches the DB. */
  async enqueueJob(
    tenantId: string,
    jobId: string,
    runId: string,
    runnerLabel: string,
    stepName: string,
    image: string | undefined,
    runCmd: string,
    repoName: string,
    commitRef: string,
    authorizationHeader: string,
  ) {
    await withTenant(tenantId, (client) =>
      client.query(
        `insert into runner_jobs (id, tenant_id, run_id, runner_label, step_name, image, run_cmd, repo_name, commit_ref)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [jobId, tenantId, runId, runnerLabel, stepName, image ?? null, runCmd, repoName, commitRef],
      ),
    );
    this.broker.stashAuthHeader(jobId, authorizationHeader);
  }

  /** Parses+verifies a runner bearer token. Returns null on any failure —
   *  callers (RunnerTokenGuard) turn that into a 401, deliberately not
   *  distinguishing "malformed token" from "wrong secret" from "unknown
   *  runner" in the response, same as every other auth failure in this
   *  platform not leaking which part was wrong. */
  async authenticate(token: string): Promise<{ tenantId: string; runnerId: string } | null> {
    const decoded = decodeToken(token);
    if (!decoded) return null;
    const { tenantId, runnerId, rawSecret } = decoded;
    const tokenHash = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select token_hash from runners where id = $1`, [runnerId]);
      return rows[0]?.token_hash as string | undefined;
    });
    if (!tokenHash) return null;
    const ok = await verifySecret(rawSecret, tokenHash);
    return ok ? { tenantId, runnerId } : null;
  }

  async heartbeat(tenantId: string, runnerId: string) {
    return withTenant(tenantId, async (client) => {
      await client.query(`update runners set status = 'online', last_heartbeat_at = now() where id = $1`, [runnerId]);
      return { status: 'ok' };
    });
  }

  /** Atomically claims the oldest queued job matching any of the caller's
   *  labels — `for update skip locked` so two runner processes polling
   *  concurrently never both claim the same job. Returns null (not an
   *  error) when there's simply nothing to do, since "no work right now"
   *  is the overwhelmingly common poll response, not a failure. */
  async claimNextJob(tenantId: string, runnerId: string, requestedLabels: string[]) {
    if (requestedLabels.length === 0) return null;
    const job = await withTenant(tenantId, async (client) => {
      // Never trust the caller-supplied labels on their own — a runner may
      // only claim within labels it's actually registered with, so
      // intersect the query with the runner's own `labels` column.
      const { rows: runnerRows } = await client.query(`select labels from runners where id = $1`, [runnerId]);
      const registeredLabels: string[] = runnerRows[0]?.labels ?? [];
      const labels = requestedLabels.filter((label) => registeredLabels.includes(label));
      if (labels.length === 0) return null;
      const { rows } = await client.query(
        `update runner_jobs set status = 'claimed', claimed_by_runner_id = $2, claimed_at = now()
         where id = (
           select id from runner_jobs
           where tenant_id = $1 and status = 'queued' and runner_label = any($3)
           order by created_at
           limit 1
           for update skip locked
         )
         returning id, run_id, step_name, image, run_cmd, repo_name, commit_ref`,
        [tenantId, runnerId, labels],
      );
      return rows[0] ?? null;
    });
    if (!job) return null;
    // Handed to the agent exactly once, here, at claim time — never
    // persisted (see JobBrokerService's docblock).
    const authorizationHeader = this.broker.takeAuthHeader(job.id);
    return { ...job, authorizationHeader };
  }

  async completeJob(
    tenantId: string,
    runnerId: string,
    jobId: string,
    status: 'succeeded' | 'failed',
    log: string,
    exitCode: number,
  ) {
    const job = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update runner_jobs set status = $2, log = $3, exit_code = $4, completed_at = now()
         where id = $1 and status = 'claimed' and claimed_by_runner_id = $5 returning id`,
        [jobId, status, log, exitCode, runnerId],
      );
      return rows[0];
    });
    if (!job) {
      throw new ForbiddenException(
        'no job with this id claimed by this runner — it may already be completed, claimed by another runner, or was never claimed',
      );
    }
    // Wakes up RunnerService.execute(), which is blocked in JobBrokerService
    // waiting on exactly this id — see runner.service.ts's runsOn branch.
    this.broker.resolve(jobId, { status, log, exitCode });
    return { status: 'recorded' };
  }
}
