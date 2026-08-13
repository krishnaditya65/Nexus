import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';
import { TicketsService } from '../tickets/tickets.service';

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required: boolean;
}

/**
 * Forms → tickets (docs/FEATURES.md §12.3) — a form whose submission
 * creates a real ticket with mapped fields, public forms reachable with
 * no login (an "intake form" / "customer bug report" use case). Public
 * lookup/submit go through a narrow SECURITY DEFINER SQL function (see
 * 018_forms.sql's docblock) — the same "resolve a credential/token
 * before app.tenant_id can be set" shape as every other pre-auth lookup
 * in this platform. Reuses TicketsService.create() rather than
 * duplicating ticket-creation logic (same "same DI module, so import
 * directly, no forwardRef needed" reasoning as AutomationsService — the
 * dependency direction here (Forms → Tickets) isn't circular).
 */
@Injectable()
export class FormsService {
  constructor(private readonly tickets: TicketsService) {}

  async create(
    tenantId: string,
    projectId: string,
    name: string,
    description: string | undefined,
    isPublic: boolean,
    defaultTicketType: string,
    fields: FormField[],
    createdByUserId: string,
  ) {
    validateFields(fields);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into ticket_forms
           (tenant_id, project_id, name, description, is_public, default_ticket_type, fields, created_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
        [tenantId, projectId, name, description ?? null, isPublic, defaultTicketType, JSON.stringify(fields), createdByUserId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from ticket_forms where project_id = $1 order by created_at desc`, [projectId]);
      return rows;
    });
  }

  async listSubmissions(tenantId: string, formId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from ticket_form_submissions where form_id = $1 order by submitted_at desc`,
        [formId],
      );
      return rows;
    });
  }

  /** Anonymous, pre-auth — returns only what a public form-render UI
   *  needs (never tenant_id itself in a way the client would treat as
   *  something to trust; it's only used server-side by submitPublic). */
  async getPublicForm(token: string) {
    const { rows } = await pool.query(`select * from resolve_public_ticket_form($1)`, [token]);
    if (!rows[0]) throw new NotFoundException('Form not found or not public');
    const { tenant_id, ...publicShape } = rows[0];
    return publicShape;
  }

  async submitPublic(token: string, submittedData: Record<string, string>, submitterEmail?: string) {
    const { rows } = await pool.query(`select * from resolve_public_ticket_form($1)`, [token]);
    const form = rows[0];
    if (!form) throw new NotFoundException('Form not found or not public');

    for (const field of form.fields as FormField[]) {
      if (field.required && !submittedData[field.key]?.trim()) {
        throw new BadRequestException(`Field "${field.label}" is required`);
      }
    }

    const title = submittedData.title?.trim() || form.name;
    const description = (form.fields as FormField[])
      .map((f) => `**${f.label}**: ${submittedData[f.key] ?? ''}`)
      .join('\n\n');

    const ticket = await this.tickets.create(form.tenant_id, form.project_id, form.default_ticket_type, title, description);

    await withTenant(form.tenant_id, (client) =>
      client.query(
        `insert into ticket_form_submissions (tenant_id, form_id, ticket_id, submitted_data, submitter_email)
         values ($1, $2, $3, $4, $5)`,
        [form.tenant_id, form.id, ticket.id, JSON.stringify(submittedData), submitterEmail ?? null],
      ),
    );

    return { ticketId: ticket.id, ticketNumber: ticket.ticket_number };
  }

  // --- Branded customer self-service portal (§13.7) — the same public
  // form token now also unlocks "my requests" status tracking and public
  // KB browsing, both via SECURITY DEFINER functions scoped to that one
  // form (024_customer_portal.sql). No portal-user account system: a
  // submitter's identity is just the email they already gave Forms. ---

  async getPublicRequests(token: string, email: string) {
    if (!email?.trim()) throw new BadRequestException('email is required');
    const { rows } = await pool.query(`select * from list_public_requests($1, $2)`, [token, email.trim()]);
    return rows.map((r) => ({
      submissionId: r.submission_id,
      ticketId: r.ticket_id,
      ticketNumber: r.ticket_number,
      title: r.title,
      stateName: r.state_name,
      submittedAt: r.submitted_at,
    }));
  }

  async getPublicKbArticles(token: string) {
    const { rows } = await pool.query(`select * from list_public_kb_articles($1)`, [token]);
    return rows;
  }
}

function validateFields(fields: FormField[]) {
  if (!Array.isArray(fields)) throw new BadRequestException('fields must be an array');
  for (const f of fields) {
    if (!f.key || !f.label) throw new BadRequestException('Each field needs a key and label');
    if (!['text', 'textarea'].includes(f.type)) throw new BadRequestException(`Unknown field type: ${f.type}`);
  }
}
