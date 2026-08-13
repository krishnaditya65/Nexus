import { BadRequestException, Injectable } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';

@Injectable()
export class CatalogService {
  /** Plans are shared reference data (no tenant_id) — a plain query, not
   *  withTenant, is correct here, not an oversight. */
  async listPlans() {
    const { rows } = await pool.query(`select * from plans order by seat_price_cents`);
    return rows;
  }

  async subscribe(tenantId: string, planCode: string, seatCount: number) {
    const planRes = await pool.query(`select * from plans where code = $1`, [planCode]);
    const plan = planRes.rows[0];
    if (!plan) throw new BadRequestException(`unknown plan code: ${planCode}`);

    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into tenant_subscriptions (tenant_id, plan_id, seat_count)
         values ($1, $2, $3)
         on conflict (tenant_id) do update
           set plan_id = excluded.plan_id, seat_count = excluded.seat_count, status = 'active'
         returning *`,
        [tenantId, plan.id, seatCount],
      );
      return rows[0];
    });
  }

  async getSubscription(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select s.*, p.code as plan_code, p.name as plan_name, p.seat_price_cents
         from tenant_subscriptions s join plans p on p.id = s.plan_id
         where s.tenant_id = $1`,
        [tenantId],
      );
      return rows[0] ?? null;
    });
  }

  async cancel(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update tenant_subscriptions set status = 'canceled' where tenant_id = $1 returning *`,
        [tenantId],
      );
      return rows[0] ?? null;
    });
  }
}
