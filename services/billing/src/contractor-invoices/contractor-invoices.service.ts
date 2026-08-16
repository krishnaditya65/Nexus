import { BadRequestException, ConflictException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

// Valid prior statuses for each target status a contractor invoice can be
// set to — e.g. 'paid' can only be reached from 'issued' (not resurrected
// from 'void', not re-marked once already 'paid'), and once 'paid' or
// 'void' an invoice is terminal (no path back to 'issued').
const VALID_PRIOR_STATUSES: Record<'issued' | 'paid' | 'void', Array<'issued' | 'paid' | 'void'>> = {
  issued: [],
  paid: ['issued'],
  void: ['issued'],
};

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
      const validPrior = VALID_PRIOR_STATUSES[status];
      const { rows } = await client.query(
        `update contractor_invoices set status = $2 where id = $1 and status = any($3::text[]) returning *`,
        [invoiceId, status, validPrior],
      );
      if (!rows[0]) {
        const { rows: existing } = await client.query(`select status from contractor_invoices where id = $1`, [
          invoiceId,
        ]);
        if (!existing[0]) throw new BadRequestException('contractor invoice not found');
        throw new ConflictException(`contractor invoice is '${existing[0].status}' and cannot transition to '${status}'`);
      }
      return rows[0];
    });
  }
}
