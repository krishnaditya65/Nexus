import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class ContractorInvoicesService {
  async create(
    tenantId: string,
    contractorUserId: string,
    timesheetId: string,
    clientName: string,
    hours: number,
    rateCentsPerHour: number,
  ) {
    if (hours <= 0) throw new BadRequestException('hours must be positive — nothing to invoice');
    const amountCents = Math.round(hours * rateCentsPerHour);

    return withTenant(tenantId, async (client) => {
      const existing = await client.query(
        `select * from contractor_invoices where tenant_id = $1 and timesheet_id = $2`,
        [tenantId, timesheetId],
      );
      if (existing.rows[0]) {
        // Regenerating an invoice for an already-invoiced timesheet is a
        // no-op returning the existing invoice, not a duplicate charge —
        // matches the idempotency discipline used elsewhere (e.g. the
        // GitHub connector's re-sync behavior).
        return { ...existing.rows[0], alreadyExisted: true };
      }

      const { rows } = await client.query(
        `insert into contractor_invoices (tenant_id, contractor_user_id, timesheet_id, client_name, hours, rate_cents_per_hour, amount_cents)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [tenantId, contractorUserId, timesheetId, clientName, hours, rateCentsPerHour, amountCents],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from contractor_invoices where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async setStatus(tenantId: string, invoiceId: string, status: 'issued' | 'paid' | 'void') {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update contractor_invoices set status = $2 where id = $1 returning *`,
        [invoiceId, status],
      );
      if (!rows[0]) throw new BadRequestException('contractor invoice not found');
      return rows[0];
    });
  }
}
