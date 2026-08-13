import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * Generic ticket-level approval workflow (docs/FEATURES.md §12.4) —
 * distinct from services/cicd's environment approval gates (which are
 * scoped to pipeline deployments), this attaches to any ticket at all.
 * Multiple approval requests can be outstanding on the same ticket
 * (addressed to different approvers) since real sign-off processes often
 * need more than one party (e.g. legal AND finance).
 */
@Injectable()
export class ApprovalsService {
  async request(tenantId: string, ticketId: string, requestedByUserId: string, approverUserId: string, comment?: string) {
    const { approval, projectId } = await withTenant(tenantId, async (client) => {
      const ticketRes = await client.query(`select id, project_id from tickets where id = $1`, [ticketId]);
      if (!ticketRes.rows[0]) throw new BadRequestException('Ticket not found');
      const { rows } = await client.query(
        `insert into ticket_approvals (tenant_id, ticket_id, requested_by_user_id, approver_user_id, request_comment)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, ticketId, requestedByUserId, approverUserId, comment ?? null],
      );
      return { approval: rows[0], projectId: ticketRes.rows[0].project_id as string };
    });

    this.notify(tenantId, approverUserId, 'You have an approval request', comment || 'A ticket needs your approval', 'approval_request', projectId);
    return approval;
  }

  async list(tenantId: string, ticketId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from ticket_approvals where ticket_id = $1 order by requested_at desc`,
        [ticketId],
      );
      return rows;
    });
  }

  /** Every approval addressed to the requesting user, across every
   *  ticket — the "my approvals" queue a real approver actually needs,
   *  not just a per-ticket list they'd have to already know to look at. */
  async listForApprover(tenantId: string, approverUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select a.*, t.title as ticket_title, t.ticket_number, t.project_id
         from ticket_approvals a join tickets t on t.id = a.ticket_id
         where a.tenant_id = $1 and a.approver_user_id = $2
         order by (a.status = 'pending') desc, a.requested_at desc`,
        [tenantId, approverUserId],
      );
      return rows;
    });
  }

  /** Only the addressed approver can decide — not the requester, not any
   *  other tenant member. Same "you can't approve your own request"
   *  spirit as every real approval system. */
  async decide(tenantId: string, approvalId: string, decidingUserId: string, decision: 'approved' | 'rejected', comment?: string) {
    const { approval, projectId } = await withTenant(tenantId, async (client) => {
      const { rows: existing } = await client.query(
        `select a.*, t.project_id from ticket_approvals a join tickets t on t.id = a.ticket_id where a.id = $1`,
        [approvalId],
      );
      const current = existing[0];
      if (!current) throw new NotFoundException('Approval request not found');
      if (current.approver_user_id !== decidingUserId) {
        throw new ForbiddenException('Only the addressed approver can decide this request');
      }
      if (current.status !== 'pending') {
        throw new BadRequestException(`This request was already ${current.status}`);
      }
      const { rows } = await client.query(
        `update ticket_approvals set status = $1, decision_comment = $2, decided_at = now() where id = $3 returning *`,
        [decision, comment ?? null, approvalId],
      );
      return { approval: rows[0], projectId: current.project_id as string };
    });

    this.notify(
      tenantId,
      approval.requested_by_user_id,
      `Your approval request was ${decision}`,
      comment || `Decision: ${decision}`,
      'approval_request',
      projectId,
    );
    return approval;
  }

  private async notify(tenantId: string, userId: string, title: string, body: string, category: string, projectId: string | null = null) {
    try {
      await fetch(`${NOTIFICATIONS_URL}/internal/notifications/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({ tenantId, userId, title, body, category, projectId }),
      });
    } catch {
      // Best-effort — a failed push shouldn't fail the approval request/
      // decision itself, same reasoning as automations.service.ts's notify().
    }
  }
}
