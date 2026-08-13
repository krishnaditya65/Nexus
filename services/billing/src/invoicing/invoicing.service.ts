import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

/** Usage-metric line items billed per unit above what a seat license
 *  includes — kept as a small static table here rather than a full
 *  rating-rules engine, which is the natural next step once real usage
 *  volume justifies it. */
const OVERAGE_RATES_CENTS_PER_UNIT: Record<string, number> = {
  ci_minutes: 2,
  storage_gb: 10,
};

// Pulled out as standalone, exported, pure functions — the actual line-
// item math worth guarding with a regression test — so they're unit-
// testable without a database. See invoicing.service.spec.ts.
export function seatLineItem(planName: string, seatPriceCents: number, seatCount: number) {
  return {
    description: `${planName} plan — ${seatCount} seat(s)`,
    amountCents: seatPriceCents * seatCount,
  };
}

export function overageLineItem(metric: string, rateCentsPerUnit: number, totalUnits: number) {
  return {
    description: `${metric} usage (${totalUnits} units @ ${rateCentsPerUnit}¢)`,
    amountCents: Math.round(totalUnits * rateCentsPerUnit),
  };
}

@Injectable()
export class InvoicingService {
  async generateInvoice(tenantId: string, periodStart: string, periodEnd: string) {
    return withTenant(tenantId, async (client) => {
      const subRes = await client.query(
        `select s.*, p.seat_price_cents, p.name as plan_name
         from tenant_subscriptions s join plans p on p.id = s.plan_id
         where s.tenant_id = $1`,
        [tenantId],
      );
      const subscription = subRes.rows[0];
      if (!subscription) {
        throw new BadRequestException('tenant has no active subscription to invoice');
      }

      const lineItems: Array<{ description: string; amountCents: number }> = [
        seatLineItem(subscription.plan_name, subscription.seat_price_cents, subscription.seat_count),
      ];

      for (const [metric, rateCents] of Object.entries(OVERAGE_RATES_CENTS_PER_UNIT)) {
        const usageRes = await client.query(
          `select coalesce(sum(quantity), 0) as total from usage_events
           where tenant_id = $1 and metric = $2 and recorded_at >= $3 and recorded_at < $4`,
          [tenantId, metric, periodStart, periodEnd],
        );
        const total = Number(usageRes.rows[0].total);
        if (total > 0) {
          lineItems.push(overageLineItem(metric, rateCents, total));
        }
      }

      const amountCents = lineItems.reduce((sum, item) => sum + item.amountCents, 0);

      const { rows } = await client.query(
        `insert into invoices (tenant_id, period_start, period_end, amount_cents, status, line_items)
         values ($1, $2, $3, $4, 'issued', $5) returning *`,
        [tenantId, periodStart, periodEnd, amountCents, JSON.stringify(lineItems)],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from invoices where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async markPaid(tenantId: string, invoiceId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update invoices set status = 'paid' where id = $1 returning *`,
        [invoiceId],
      );
      return rows[0] ?? null;
    });
  }
}
