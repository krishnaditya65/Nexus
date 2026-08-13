import { Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { TicketsService } from '../tickets/tickets.service';

@Injectable()
export class TicketTemplatesService {
  constructor(private readonly tickets: TicketsService) {}

  async create(
    tenantId: string,
    projectId: string,
    name: string,
    ticketType: string,
    titleTemplate: string,
    descriptionTemplate: string,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into ticket_templates (tenant_id, project_id, name, ticket_type, title_template, description_template)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, projectId, name, ticketType, titleTemplate, descriptionTemplate],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from ticket_templates where tenant_id = $1 and project_id = $2 order by created_at`,
        [tenantId, projectId],
      );
      return rows;
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from ticket_templates where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('Template not found');
      return { status: 'deleted' };
    });
  }

  /** Creates a real ticket pre-filled from a template — an explicit
   *  title/description override (e.g. adding the specific customer name
   *  to a "Customer Bug" template) always wins over the template's own
   *  text, same as filling in a form that started with placeholder text. */
  async createFromTemplate(
    tenantId: string,
    templateId: string,
    projectId: string,
    titleOverride?: string,
    descriptionOverride?: string,
  ) {
    const template = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from ticket_templates where id = $1`, [templateId]);
      return rows[0];
    });
    if (!template) throw new NotFoundException('Template not found');

    return this.tickets.create(
      tenantId,
      projectId,
      template.ticket_type,
      titleOverride ?? template.title_template,
      descriptionOverride ?? template.description_template,
    );
  }
}
