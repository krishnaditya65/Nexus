import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const STATUSES = new Set(['unreleased', 'released', 'archived']);

@Injectable()
export class ReleasesService {
  async create(tenantId: string, projectId: string, name: string, description: string, releaseDate: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into releases (tenant_id, project_id, name, description, release_date)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, projectId, name, description, releaseDate],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from releases where tenant_id = $1 and project_id = $2 order by created_at desc`,
        [tenantId, projectId],
      );
      return rows;
    });
  }

  /** Single-release fetch — used by this controller's GET :id, and by
   *  services/qa (test plans "tied to a release") to validate a
   *  releaseRef actually names a real release in this tenant before
   *  storing it, and to display the release's real name/status rather
   *  than a free-text string that could silently drift out of sync. */
  async get(tenantId: string, releaseId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from releases where id = $1`, [releaseId]);
      if (!rows[0]) throw new NotFoundException('Release not found');
      return rows[0];
    });
  }

  async setStatus(tenantId: string, releaseId: string, status: string) {
    if (!STATUSES.has(status)) throw new BadRequestException(`status must be one of: ${[...STATUSES].join(', ')}`);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update releases set status = $2, release_date = case when $2 = 'released' then coalesce(release_date, current_date) else release_date end
         where id = $1 returning *`,
        [releaseId, status],
      );
      if (!rows[0]) throw new NotFoundException('Release not found');
      return rows[0];
    });
  }

  async tagTicket(tenantId: string, ticketId: string, releaseId: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update tickets set release_id = $1, updated_at = now() where id = $2 returning *`,
        [releaseId, ticketId],
      );
      if (!rows[0]) throw new NotFoundException('Ticket not found');
      return rows[0];
    });
  }

  /** Release notes — every ticket tagged to this release, grouped by
   *  type, generated at read time from real ticket data rather than
   *  stored as separately-maintained notes text that could drift. */
  async releaseNotes(tenantId: string, releaseId: string) {
    return withTenant(tenantId, async (client) => {
      const releaseRes = await client.query(`select * from releases where id = $1`, [releaseId]);
      const release = releaseRes.rows[0];
      if (!release) throw new NotFoundException('Release not found');

      const ticketsRes = await client.query(
        `select t.id, t.ticket_number, t.type, t.title, ws.name as state_name
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.release_id = $1 order by t.type, t.ticket_number`,
        [releaseId],
      );

      const byType = new Map<string, any[]>();
      for (const row of ticketsRes.rows) {
        if (!byType.has(row.type)) byType.set(row.type, []);
        byType.get(row.type)!.push(row);
      }

      return { release, ticketsByType: Object.fromEntries(byType) };
    });
  }
}
