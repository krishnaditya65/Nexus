import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class VendorSpendService {
  async create(
    tenantId: string,
    vendorName: string,
    category: string,
    monthlyCostCents: number,
    currency: string,
    renewalDate: string | null,
    notes: string,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into vendor_subscriptions (tenant_id, vendor_name, category, monthly_cost_cents, currency, renewal_date, notes)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [tenantId, vendorName, category, monthlyCostCents, currency, renewalDate, notes],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from vendor_subscriptions where tenant_id = $1 order by monthly_cost_cents desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from vendor_subscriptions where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('vendor subscription not found');
      return { status: 'deleted' };
    });
  }

  /** Total monthly spend + a breakdown by category — the report a
   *  finance/ops person actually wants, not just a raw list. */
  async summary(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select category, sum(monthly_cost_cents)::int as total_cents, count(*)::int as vendor_count
         from vendor_subscriptions where tenant_id = $1 group by category order by total_cents desc`,
        [tenantId],
      );
      const totalMonthlyCents = rows.reduce((sum, r) => sum + r.total_cents, 0);
      return { totalMonthlyCents, byCategory: rows };
    });
  }
}
