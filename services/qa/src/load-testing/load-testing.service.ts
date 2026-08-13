import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { parseK6Summary } from './k6-parser';

@Injectable()
export class LoadTestingService {
  async ingest(tenantId: string, planId: string, json: string, cicdRunId?: string) {
    const summary = parseK6Summary(json);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into load_test_runs
           (tenant_id, plan_id, vus, iterations, http_req_count, http_req_failed_rate,
            avg_duration_ms, p95_duration_ms, p99_duration_ms, raw_metrics, cicd_run_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         returning *`,
        [
          tenantId,
          planId,
          summary.vus ?? null,
          summary.iterations ?? null,
          summary.httpReqCount ?? null,
          summary.httpReqFailedRate ?? null,
          summary.avgDurationMs ?? null,
          summary.p95DurationMs ?? null,
          summary.p99DurationMs ?? null,
          JSON.stringify(summary),
          cicdRunId ?? null,
        ],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, planId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from load_test_runs where tenant_id = $1 and plan_id = $2 order by recorded_at desc`,
        [tenantId, planId],
      );
      return rows;
    });
  }
}
