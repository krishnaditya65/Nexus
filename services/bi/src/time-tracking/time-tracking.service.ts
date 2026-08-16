import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { RateCardsService } from '../budgets/rate-cards.service';

const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL ?? 'http://localhost:4012';

function weekStart(date: Date): string {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday as week start
  d.setUTCDate(d.getUTCDate() + diff);
  return d.toISOString().slice(0, 10);
}

@Injectable()
export class TimeTrackingService {
  constructor(private readonly rateCards: RateCardsService) {}

  async logTime(tenantId: string, userId: string, ticketId: string | undefined, minutes: number, description: string, entryDate?: string) {
    const date = entryDate ?? new Date().toISOString().slice(0, 10);
    const entry = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into time_entries (tenant_id, user_id, ticket_id, minutes, entry_date, description)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, userId, ticketId ?? null, minutes, date, description],
      );
      return rows[0];
    });

    // Ensure a draft timesheet exists for this entry's week — the weekly
    // submission/approval workflow the original spec describes operates on
    // timesheets, not individual entries.
    await withTenant(tenantId, (client) =>
      client.query(
        `insert into timesheets (tenant_id, user_id, week_start_date) values ($1, $2, $3)
         on conflict (tenant_id, user_id, week_start_date) do nothing`,
        [tenantId, userId, weekStart(new Date(date))],
      ),
    );

    return entry;
  }

  async listForUser(tenantId: string, userId: string, weekStartDate?: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        weekStartDate
          ? `select * from time_entries where tenant_id = $1 and user_id = $2
             and entry_date >= $3::date and entry_date < ($3::date + interval '7 days')
             order by entry_date`
          : `select * from time_entries where tenant_id = $1 and user_id = $2 order by entry_date desc limit 100`,
        weekStartDate ? [tenantId, userId, weekStartDate] : [tenantId, userId],
      );
      return rows;
    });
  }

  async submitTimesheet(tenantId: string, userId: string, weekStartDate: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update timesheets set status = 'submitted', submitted_at = now()
         where tenant_id = $1 and user_id = $2 and week_start_date = $3 returning *`,
        [tenantId, userId, weekStartDate],
      );
      return rows[0] ?? null;
    });
  }

  async approveTimesheet(tenantId: string, timesheetId: string, approverUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: existing } = await client.query(`select * from timesheets where id = $1`, [timesheetId]);
      const timesheet = existing[0] ?? null;
      if (!timesheet) return null;
      // Self-approval would defeat the entire point of an approval step —
      // a submitter can't be their own approver.
      if (timesheet.user_id === approverUserId) {
        throw new ForbiddenException('You cannot approve your own timesheet');
      }
      const { rows } = await client.query(
        `update timesheets set status = 'approved', approved_by_user_id = $2, approved_at = now()
         where id = $1 returning *`,
        [timesheetId, approverUserId],
      );
      return rows[0] ?? null;
    });
  }

  async rejectTimesheet(tenantId: string, timesheetId: string, approverUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows: existing } = await client.query(`select * from timesheets where id = $1`, [timesheetId]);
      const timesheet = existing[0] ?? null;
      if (!timesheet) return null;
      if (timesheet.user_id === approverUserId) {
        throw new ForbiddenException('You cannot reject your own timesheet');
      }
      const { rows } = await client.query(
        `update timesheets set status = 'rejected', approved_by_user_id = $2, approved_at = now()
         where id = $1 returning *`,
        [timesheetId, approverUserId],
      );
      return rows[0] ?? null;
    });
  }

  async listPendingApproval(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from timesheets where tenant_id = $1 and status = 'submitted' order by week_start_date`,
        [tenantId],
      );
      return rows;
    });
  }

  /**
   * §11.7's "contractor invoicing generated from approved timesheets" —
   * the remaining gap once rate cards + the cost report already existed.
   * Sums this timesheet's real logged minutes, prices them at the
   * contractor's real hourly rate, and calls services/billing's real
   * `POST /contractor-invoices` to create the actual AR record — forwards
   * the caller's own bearer token, the same cross-service pattern used
   * everywhere else in this platform. Requires the timesheet to actually
   * be 'approved' first; a submitted-but-not-yet-approved timesheet can't
   * be invoiced, since the whole point of the approval step is to gate
   * exactly this.
   */
  async generateContractorInvoice(
    tenantId: string,
    timesheetId: string,
    clientName: string,
    authorizationHeader: string,
  ) {
    const timesheet = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from timesheets where id = $1`, [timesheetId]);
      return rows[0] ?? null;
    });
    if (!timesheet) throw new BadRequestException('timesheet not found');
    if (timesheet.status !== 'approved') {
      throw new BadRequestException(`timesheet must be approved before invoicing (current status: ${timesheet.status})`);
    }

    const totalMinutes = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select coalesce(sum(minutes), 0)::int as total from time_entries
         where tenant_id = $1 and user_id = $2
         and entry_date >= $3::date and entry_date < ($3::date + interval '7 days')`,
        [tenantId, timesheet.user_id, timesheet.week_start_date],
      );
      return rows[0].total;
    });

    const rates = await this.rateCards.ratesByUser(tenantId);
    const rateCentsPerHour = rates.get(timesheet.user_id);
    if (rateCentsPerHour == null) {
      throw new BadRequestException('contractor has no hourly rate card set — cannot generate an invoice amount');
    }

    const hours = Math.round((totalMinutes / 60) * 100) / 100; // 2 decimal places, matches numeric(6,2)

    const res = await fetch(`${BILLING_SERVICE_URL}/contractor-invoices`, {
      method: 'POST',
      headers: { authorization: authorizationHeader, 'content-type': 'application/json' },
      body: JSON.stringify({
        contractorUserId: timesheet.user_id,
        timesheetId,
        clientName,
        hours,
        rateCentsPerHour,
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new BadRequestException(`billing-service invoice creation failed: ${res.status} ${body.slice(0, 200)}`);
    }
    return res.json();
  }
}
