import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class RateCardsService {
  async setRate(tenantId: string, userId: string, hourlyRateCents: number, currency: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into user_hourly_rates (tenant_id, user_id, hourly_rate_cents, currency)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, user_id) do update set hourly_rate_cents = excluded.hourly_rate_cents, currency = excluded.currency, updated_at = now()
         returning *`,
        [tenantId, userId, hourlyRateCents, currency],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from user_hourly_rates where tenant_id = $1`, [tenantId]);
      return rows;
    });
  }

  /** Internal helper for the cost report below — a map is more useful
   *  there than a list. */
  async ratesByUser(tenantId: string): Promise<Map<string, number>> {
    const rows = await this.list(tenantId);
    return new Map(rows.map((r) => [r.user_id, r.hourly_rate_cents]));
  }
}
