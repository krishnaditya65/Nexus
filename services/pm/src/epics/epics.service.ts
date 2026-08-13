import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class EpicsService {
  /**
   * Rolls up an Epic's child tickets (tickets.parent_ticket_id) into
   * completion counts and a percentage — the computation Jira's epic
   * progress bar and ADO's rollup views are built on. `parent_ticket_id`
   * and `type: 'epic'` have existed in the schema since 001_init.sql;
   * nothing computed a rollup over them until now.
   */
  async rollup(tenantId: string, epicTicketId: string) {
    return withTenant(tenantId, async (client) => {
      const epicRes = await client.query(
        `select * from tickets where id = $1`,
        [epicTicketId],
      );
      const epic = epicRes.rows[0];
      if (!epic) throw new BadRequestException('Epic not found');
      if (epic.type !== 'epic') {
        throw new BadRequestException(`Ticket ${epic.id} is type '${epic.type}', not 'epic'`);
      }

      const childrenRes = await client.query(
        `select t.*, ws.name as state_name, ws.is_terminal
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.parent_ticket_id = $1
         order by t.ticket_number`,
        [epicTicketId],
      );
      const children = childrenRes.rows;

      const totalCount = children.length;
      const doneCount = children.filter((c) => c.is_terminal).length;
      const totalPoints = children.reduce((sum, c) => sum + (c.story_points == null ? 0 : Number(c.story_points)), 0);
      const donePoints = children
        .filter((c) => c.is_terminal)
        .reduce((sum, c) => sum + (c.story_points == null ? 0 : Number(c.story_points)), 0);

      return {
        epicId: epic.id,
        epicTitle: epic.title,
        totalCount,
        doneCount,
        percentCompleteByCount: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 1000) / 10,
        totalPoints,
        donePoints,
        percentCompleteByPoints: totalPoints === 0 ? 0 : Math.round((donePoints / totalPoints) * 1000) / 10,
        children,
      };
    });
  }

  /** Every epic in a project with its rollup already computed — the
   *  roadmap/portfolio-style view, one call instead of N. */
  async rollupAllEpics(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const epicsRes = await client.query(
        `select id from tickets where project_id = $1 and type = 'epic' order by ticket_number`,
        [projectId],
      );
      const rollups = [];
      for (const row of epicsRes.rows) {
        rollups.push(await this.rollupWithinTransaction(client, row.id));
      }
      return rollups;
    });
  }

  /** Shared computation, reused by rollup() (its own transaction via
   *  withTenant) and rollupAllEpics() (one transaction for all epics, to
   *  avoid N separate connection round-trips for a project-wide view). */
  private async rollupWithinTransaction(client: any, epicTicketId: string) {
    const epicRes = await client.query(`select * from tickets where id = $1`, [epicTicketId]);
    const epic = epicRes.rows[0];
    const childrenRes = await client.query(
      `select t.*, ws.is_terminal
       from tickets t join workflow_states ws on ws.id = t.state_id
       where t.parent_ticket_id = $1`,
      [epicTicketId],
    );
    const children = childrenRes.rows;
    const totalCount = children.length;
    const doneCount = children.filter((c: any) => c.is_terminal).length;
    const totalPoints = children.reduce((sum: number, c: any) => sum + (c.story_points == null ? 0 : Number(c.story_points)), 0);
    return {
      epicId: epic.id,
      epicTitle: epic.title,
      totalCount,
      doneCount,
      percentCompleteByCount: totalCount === 0 ? 0 : Math.round((doneCount / totalCount) * 1000) / 10,
      totalPoints,
      // §13.4's Roadmap/Gantt timeline reuses these two — no new schema:
      // `due_date` already exists (§12.1) as the epic's target finish
      // date; `created_at` stands in for a "start" the schema has no
      // dedicated column for (there is no `tickets.start_date`), an
      // honestly-disclosed approximation, not a true planned-start field.
      dueDate: epic.due_date,
      createdAt: epic.created_at,
    };
  }
}
