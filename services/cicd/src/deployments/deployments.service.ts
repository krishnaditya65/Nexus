import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { EnvironmentsService } from '../environments/environments.service';

@Injectable()
export class DeploymentsService {
  constructor(private readonly environments: EnvironmentsService) {}

  /**
   * Requests promoting an already-completed pipeline run into an
   * environment. Rejects outright if: the run didn't succeed (nothing to
   * promote), or the environment is inside a freeze window. Otherwise
   * lands as 'pending_approval' if the environment requires it, or
   * auto-'approved' if it doesn't, mirroring ADO's distinction between
   * gated and ungated environments.
   *
   * `strategy` picks what happens once approved (see approve()'s
   * docblock and this file's header comment for the traffic-percentage
   * scope note): 'direct' (default) goes straight to 100% 'deployed',
   * 'canary' steps through `canaryStages` (e.g. [10, 50, 100]) requiring
   * an explicit promote between each, 'blue_green' lands at 'verifying'
   * (0% traffic, deployed to the idle slot) requiring an explicit cutover.
   */
  async request(
    tenantId: string,
    environmentId: string,
    pipelineRunId: string,
    requestedByUserId: string,
    strategy: 'direct' | 'canary' | 'blue_green' = 'direct',
    canaryStages?: number[],
    autoRollbackErrorRateThreshold?: number,
  ) {
    await this.environments.assertNotFrozen(tenantId, environmentId);

    if (strategy === 'canary') {
      if (!canaryStages || canaryStages.length === 0) {
        throw new BadRequestException('canaryStages is required for strategy=canary (e.g. [10, 50, 100])');
      }
      if (canaryStages[canaryStages.length - 1] !== 100) {
        throw new BadRequestException('the last canary stage must be 100 (full rollout)');
      }
    }

    return withTenant(tenantId, async (client) => {
      const runRes = await client.query(`select * from pipeline_runs where id = $1`, [pipelineRunId]);
      const run = runRes.rows[0];
      if (!run) throw new NotFoundException('Pipeline run not found');
      if (run.status !== 'succeeded') {
        throw new BadRequestException(
          `Pipeline run status is '${run.status}' — only a succeeded run can be promoted to an environment`,
        );
      }

      const envRes = await client.query(`select * from environments where id = $1`, [environmentId]);
      const environment = envRes.rows[0];
      if (!environment) throw new NotFoundException('Environment not found');

      const initialStatus = environment.requires_approval ? 'pending_approval' : 'approved';
      const { rows } = await client.query(
        `insert into deployments (tenant_id, environment_id, pipeline_run_id, status, requested_by_user_id,
                                   approved_at, strategy, canary_stages, auto_rollback_error_rate_threshold)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [
          tenantId,
          environmentId,
          pipelineRunId,
          initialStatus,
          requestedByUserId,
          environment.requires_approval ? null : new Date(),
          strategy,
          canaryStages ? JSON.stringify(canaryStages) : null,
          autoRollbackErrorRateThreshold ?? null,
        ],
      );
      const deployment = rows[0];

      if (!environment.requires_approval) {
        return this.advanceAfterApprovalWithinClient(client, deployment);
      }
      return deployment;
    });
  }

  async list(tenantId: string, environmentId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from deployments where environment_id = $1 order by requested_at desc`,
        [environmentId],
      );
      return rows;
    });
  }

  /**
   * Deployment tracking on a ticket (docs/FEATURES.md §13.5) — "which
   * environment(s) has this branch actually reached," the query the
   * Development Panel's PR list hangs off once it knows a linked PR's
   * repo + source branch (see services/git-host's devpanel package).
   * Joins deployments -> pipeline_runs (for commit_ref, the branch a run
   * was triggered from) -> pipelines (for repo_name) -> environments (for
   * name/position), one row per (environment, deployment) — a branch can
   * legitimately have been deployed to the same environment more than
   * once across separate runs, and the caller wants the real history, not
   * a collapsed "latest only" view (see per-environment ordering below,
   * newest first, for a UI to easily take just the first per environment
   * if that's all it wants).
   */
  async listByBranch(tenantId: string, repoName: string, branch: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select d.id, d.status, d.requested_at, d.deployed_at, d.strategy, d.canary_stages, d.current_stage_index,
                e.name as environment_name, e.position as environment_position
         from deployments d
         join pipeline_runs pr on pr.id = d.pipeline_run_id
         join pipelines p on p.id = pr.pipeline_id
         join environments e on e.id = d.environment_id
         where d.tenant_id = $1 and p.repo_name = $2 and pr.commit_ref = $3
         order by e.position asc, d.requested_at desc`,
        [tenantId, repoName, branch],
      );
      return rows.map((r) => ({
        ...r,
        trafficPercentage: currentTrafficPercentage({
          status: r.status,
          strategy: r.strategy,
          canary_stages: r.canary_stages,
          current_stage_index: r.current_stage_index,
        }),
      }));
    });
  }

  /** Owner/admin approves a pending deployment — moves it to 'approved'
   *  and then immediately advances it per its strategy (see
   *  advanceAfterApprovalWithinClient's docblock): straight to 'deployed'
   *  for 'direct', into staged rollout for 'canary', or into 'verifying'
   *  for 'blue_green'. */
  async approve(tenantId: string, deploymentId: string, approvedByUserId: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from deployments where id = $1`, [deploymentId]);
      if (!existing.rows[0]) throw new NotFoundException('Deployment not found');
      if (existing.rows[0].status !== 'pending_approval') {
        throw new BadRequestException(`Deployment is '${existing.rows[0].status}', can only approve 'pending_approval'`);
      }
      const { rows } = await client.query(
        `update deployments set status = 'approved', approved_by_user_id = $1, approved_at = now() where id = $2 returning *`,
        [approvedByUserId, deploymentId],
      );
      return this.advanceAfterApprovalWithinClient(client, rows[0]);
    });
  }

  async reject(tenantId: string, deploymentId: string, rejectedByUserId: string, reason: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from deployments where id = $1`, [deploymentId]);
      if (!existing.rows[0]) throw new NotFoundException('Deployment not found');
      if (existing.rows[0].status !== 'pending_approval') {
        throw new BadRequestException(`Deployment is '${existing.rows[0].status}', can only reject 'pending_approval'`);
      }
      const { rows } = await client.query(
        `update deployments
         set status = 'rejected', approved_by_user_id = $1, approved_at = now(), rejection_reason = $2
         where id = $3 returning *`,
        [rejectedByUserId, reason, deploymentId],
      );
      return rows[0];
    });
  }

  /**
   * Marks a deployment 'deployed'. IMPORTANT scope note: this records that
   * the gate passed and stamps `deployed_at` — it does not itself push
   * anything anywhere. The actual bytes-move-to-a-server work already
   * happened as real `docker run` steps in the underlying pipeline run
   * (see runner.service.ts); a deploy-to-target-infra step is expected to
   * be one of those pipeline steps. This layer's job is the promotion
   * gate and the audit trail of what was approved into what environment
   * by whom and when — the same real scope Azure DevOps Environments has.
   */
  private async markDeployedWithinClient(client: any, deploymentId: string) {
    const { rows } = await client.query(
      `update deployments set status = 'deployed', deployed_at = now() where id = $1 returning *`,
      [deploymentId],
    );
    return rows[0];
  }

  /**
   * Branches on `strategy` right after a deployment is approved — the
   * fork point between the three rollout shapes this file supports. Same
   * traffic-percentage scope note as markDeployedWithinClient: this
   * records what stage a deployment is AT, a real traffic-shift
   * integration reads `traffic_percentage` (see currentTrafficPercentage
   * below) from one of the pipeline's own steps.
   */
  private async advanceAfterApprovalWithinClient(client: any, deployment: any) {
    if (deployment.strategy === 'canary') {
      const { rows } = await client.query(
        `update deployments set status = 'rolling_out', current_stage_index = 0 where id = $1 returning *`,
        [deployment.id],
      );
      return rows[0];
    }
    if (deployment.strategy === 'blue_green') {
      const { rows } = await client.query(
        `update deployments set status = 'verifying' where id = $1 returning *`,
        [deployment.id],
      );
      return rows[0];
    }
    return this.markDeployedWithinClient(client, deployment.id);
  }

  /** Advances a 'rolling_out' canary deployment to its next stage —
   *  e.g. 10% -> 50% -> 100%. Reaching the last stage marks the
   *  deployment fully 'deployed', same terminal state a 'direct'
   *  deployment reaches immediately. */
  async promoteCanaryStage(tenantId: string, deploymentId: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from deployments where id = $1`, [deploymentId]);
      const deployment = existing.rows[0];
      if (!deployment) throw new NotFoundException('Deployment not found');
      if (deployment.strategy !== 'canary') {
        throw new BadRequestException(`Deployment strategy is '${deployment.strategy}', not 'canary'`);
      }
      if (deployment.status !== 'rolling_out') {
        throw new BadRequestException(`Deployment is '${deployment.status}', can only promote a 'rolling_out' canary`);
      }
      const stages: number[] = deployment.canary_stages;
      const nextIndex = deployment.current_stage_index + 1;
      if (nextIndex >= stages.length) {
        return this.markDeployedWithinClient(client, deploymentId);
      }
      const { rows } = await client.query(
        `update deployments set current_stage_index = $1 where id = $2 returning *`,
        [nextIndex, deploymentId],
      );
      return rows[0];
    });
  }

  /** Cuts a 'verifying' blue-green deployment over to live traffic —
   *  the one explicit action distinguishing blue-green from 'direct':
   *  the new version sits fully deployed to the idle slot first, and
   *  only this call swaps it in. */
  async cutover(tenantId: string, deploymentId: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from deployments where id = $1`, [deploymentId]);
      const deployment = existing.rows[0];
      if (!deployment) throw new NotFoundException('Deployment not found');
      if (deployment.strategy !== 'blue_green') {
        throw new BadRequestException(`Deployment strategy is '${deployment.strategy}', not 'blue_green'`);
      }
      if (deployment.status !== 'verifying') {
        throw new BadRequestException(`Deployment is '${deployment.status}', can only cut over a 'verifying' deployment`);
      }
      return this.markDeployedWithinClient(client, deploymentId);
    });
  }

  /** Aborts a canary mid-rollout or a blue-green still in 'verifying' —
   *  the whole reason either strategy exists over 'direct': catch a bad
   *  rollout before it reaches 100% traffic. Not available once a
   *  deployment is already fully 'deployed' (that's what a NEW deployment
   *  — a rollback release — is for, same as ADO). */
  async rollback(tenantId: string, deploymentId: string, reason: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from deployments where id = $1`, [deploymentId]);
      const deployment = existing.rows[0];
      if (!deployment) throw new NotFoundException('Deployment not found');
      if (deployment.status !== 'rolling_out' && deployment.status !== 'verifying') {
        throw new BadRequestException(
          `Deployment is '${deployment.status}' — rollback only applies to 'rolling_out' or 'verifying'`,
        );
      }
      const { rows } = await client.query(
        `update deployments set status = 'rolled_back', rollback_reason = $1 where id = $2 returning *`,
        [reason, deploymentId],
      );
      return rows[0];
    });
  }

  /**
   * Real ingestion endpoint for APM-pushed error-rate samples — this is
   * what makes auto-rollback "APM-triggered" rather than a fabricated
   * internal timer: a real exporter (or, in this session's live
   * verification, a curl call standing in for one) pushes a sample here,
   * and if it's an 'error_rate' sample that breaches the deployment's
   * opt-in threshold while the deployment is still 'rolling_out' or
   * 'verifying', this synchronously triggers the exact same rollback()
   * path a human clicking "Rollback" would — no separate polling loop
   * needed since ingestion is push-based, same reasoning secretscan's
   * on-push (not scheduled) trigger already used elsewhere in this
   * codebase.
   */
  async recordMetric(tenantId: string, deploymentId: string, metricName: string, value: number) {
    const deployment = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from deployments where id = $1`, [deploymentId]);
      if (!rows[0]) throw new NotFoundException('Deployment not found');
      await client.query(
        `insert into deployment_metrics (tenant_id, deployment_id, metric_name, value) values ($1, $2, $3, $4)`,
        [tenantId, deploymentId, metricName, value],
      );
      return rows[0];
    });

    const threshold = deployment.auto_rollback_error_rate_threshold;
    const inRollableState = deployment.status === 'rolling_out' || deployment.status === 'verifying';
    if (metricName === 'error_rate' && threshold != null && inRollableState && value > Number(threshold)) {
      const rolledBack = await this.rollback(
        tenantId,
        deploymentId,
        `APM auto-rollback: error_rate ${value}% exceeded threshold ${threshold}%`,
      );
      return { recorded: true, autoRolledBack: true, deployment: rolledBack };
    }
    return { recorded: true, autoRolledBack: false };
  }

  async listMetrics(tenantId: string, deploymentId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from deployment_metrics where deployment_id = $1 order by recorded_at desc limit 200`,
        [deploymentId],
      );
      return rows;
    });
  }
}

/** The traffic percentage a deployment is currently entitled to — 0 for
 *  anything not yet live, 100 for 'deployed' or a 'direct'/rolled-back
 *  deployment past that point, and the current canary stage's percentage
 *  while 'rolling_out'. Exported as a pure function (not a method) since
 *  it's also useful client-side for rendering, with no DB access needed. */
export function currentTrafficPercentage(deployment: {
  status: string;
  strategy: string;
  canary_stages?: number[] | null;
  current_stage_index: number;
}): number {
  if (deployment.status === 'deployed') return 100;
  if (deployment.status === 'rolling_out' && deployment.canary_stages) {
    return deployment.canary_stages[deployment.current_stage_index] ?? 0;
  }
  return 0;
}
