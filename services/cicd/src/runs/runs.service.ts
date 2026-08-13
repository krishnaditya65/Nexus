import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { PipelinesService } from '../pipelines/pipelines.service';
import { RunnerService } from './runner.service';

@Injectable()
export class RunsService {
  constructor(
    private readonly pipelines: PipelinesService,
    private readonly runner: RunnerService,
  ) {}

  async trigger(
    tenantId: string,
    pipelineId: string,
    commitRef: string,
    triggeredByUserId: string | null,
    triggerType: 'manual' | 'webhook',
    authorizationHeader: string,
  ) {
    const pipeline = await this.pipelines.get(tenantId, pipelineId);
    if (!pipeline) throw new BadRequestException('unknown pipeline');

    const run = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into pipeline_runs (tenant_id, pipeline_id, trigger_type, triggered_by_user_id, commit_ref)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, pipelineId, triggerType, triggeredByUserId, commitRef],
      );
      return rows[0];
    });

    // Execution runs async — the trigger endpoint returns the queued run
    // immediately (matches how every CI provider's "trigger build" API
    // behaves: you poll/subscribe for status, you don't block on completion).
    this.runner
      .execute(tenantId, run.id, pipeline.repo_name, commitRef, pipeline.yaml_definition, authorizationHeader)
      .catch(() => {
        /* runner.service.ts already records failure state on the run row */
      });

    return run;
  }

  async get(tenantId: string, runId: string) {
    return withTenant(tenantId, async (client) => {
      const runRes = await client.query(`select * from pipeline_runs where id = $1`, [runId]);
      const stepsRes = await client.query(
        `select * from pipeline_run_steps where run_id = $1 order by started_at`,
        [runId],
      );
      return { ...runRes.rows[0], steps: stepsRes.rows };
    });
  }

  async decideApproval(tenantId: string, stepId: string, userId: string, approved: boolean) {
    const ok = await this.runner.decideApproval(tenantId, stepId, userId, approved);
    if (!ok) {
      throw new BadRequestException(
        'no pending approval gate for this step — it may already be decided or was never an approval step',
      );
    }
    return { decided: true, approved };
  }

  async list(tenantId: string, pipelineId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from pipeline_runs where tenant_id = $1 and pipeline_id = $2 order by started_at desc`,
        [tenantId, pipelineId],
      );
      return rows;
    });
  }
}
