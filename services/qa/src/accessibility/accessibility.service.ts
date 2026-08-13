import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { parseAxeResults } from './axe-parser';

@Injectable()
export class AccessibilityService {
  async ingest(tenantId: string, planId: string, json: string, cicdRunId?: string) {
    const result = parseAxeResults(json);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into accessibility_audits
           (tenant_id, plan_id, url, critical_count, serious_count, moderate_count, minor_count, violations, cicd_run_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning *`,
        [
          tenantId,
          planId,
          result.url ?? null,
          result.countsByImpact.critical,
          result.countsByImpact.serious,
          result.countsByImpact.moderate,
          result.countsByImpact.minor,
          JSON.stringify(result.violations),
          cicdRunId ?? null,
        ],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, planId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from accessibility_audits where tenant_id = $1 and plan_id = $2 order by recorded_at desc`,
        [tenantId, planId],
      );
      return rows;
    });
  }
}
