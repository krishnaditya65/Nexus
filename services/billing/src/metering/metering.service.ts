import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class MeteringService {
  async recordUsage(tenantId: string, metric: string, quantity: number, sourceService: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into usage_events (tenant_id, metric, quantity, source_service)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, metric, quantity, sourceService],
      );
      return rows[0];
    });
  }

  async summarizeCurrentPeriod(tenantId: string, metric: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select coalesce(sum(quantity), 0) as total
         from usage_events
         where tenant_id = $1 and metric = $2
           and recorded_at >= date_trunc('month', now())`,
        [tenantId, metric],
      );
      return { metric, total: Number(rows[0].total) };
    });
  }

  async setEntitlement(tenantId: string, featureKey: string, limitValue: number) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into entitlements (tenant_id, feature_key, limit_value)
         values ($1, $2, $3)
         on conflict (tenant_id, feature_key) do update set limit_value = excluded.limit_value
         returning *`,
        [tenantId, featureKey, limitValue],
      );
      return rows[0];
    });
  }

  async listEntitlements(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from entitlements where tenant_id = $1`, [tenantId]);
      return rows;
    });
  }

  /**
   * The noisy-neighbor / fair-use check: other services (api-platform's
   * rate limiter, the CI runner) call this before allowing further
   * consumption. Returns allowed=false once a tenant's plan-defined cap for
   * this billing period is hit — the enforcement point, not just a report.
   */
  async checkEntitlement(tenantId: string, featureKey: string, additionalQuantity = 1) {
    return withTenant(tenantId, async (client) => {
      const entitlementRes = await client.query(
        `select * from entitlements where tenant_id = $1 and feature_key = $2`,
        [tenantId, featureKey],
      );
      const entitlement = entitlementRes.rows[0];
      if (!entitlement) {
        // No explicit cap configured — default-open, matching how this
        // platform's other guards default (fail toward availability, not
        // toward silently blocking a tenant nobody configured limits for).
        return { allowed: true, limit: null, currentUsage: null };
      }

      const usageMetric = featureKey.replace(/_per_month$/, '');
      const usageRes = await client.query(
        `select coalesce(sum(quantity), 0) as total from usage_events
         where tenant_id = $1 and metric = $2 and recorded_at >= date_trunc('month', now())`,
        [tenantId, usageMetric],
      );
      const currentUsage = Number(usageRes.rows[0].total);
      const limit = Number(entitlement.limit_value);
      return {
        allowed: currentUsage + additionalQuantity <= limit,
        limit,
        currentUsage,
      };
    });
  }
}
