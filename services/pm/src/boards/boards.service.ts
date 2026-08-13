import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

interface ColumnInput {
  name: string;
  wipLimit: number | null;
  workflowStateIds: string[];
}

@Injectable()
export class BoardsService {
  /**
   * The board itself: every column in position order, each with the
   * workflow states that feed it and the tickets currently sitting in
   * those states — scoped to a sprint (a Scrum board) if sprintId is
   * given, or every unfinished ticket in the project (a Kanban board) if
   * not. `wipViolation` flags a column whose ticket count exceeds its
   * configured wip_limit, the same "over the limit" highlight Jira/ADO
   * boards show — computed here, not left for a frontend to reimplement.
   */
  async getBoard(
    tenantId: string,
    projectId: string,
    sprintId: string | null,
    groupBy: 'assignee' | 'epic' | null = null,
  ) {
    return withTenant(tenantId, async (client) => {
      const columnsRes = await client.query(
        `select id, name, position, wip_limit from board_columns
         where project_id = $1 order by position`,
        [projectId],
      );
      if (!columnsRes.rows.length) {
        throw new BadRequestException('Project has no board configured');
      }

      const stateMapRes = await client.query(
        `select bcs.board_column_id, bcs.workflow_state_id
         from board_column_states bcs
         join board_columns bc on bc.id = bcs.board_column_id
         where bc.project_id = $1`,
        [projectId],
      );
      const stateToColumn = new Map<string, string>();
      for (const row of stateMapRes.rows) stateToColumn.set(row.workflow_state_id, row.board_column_id);

      const ticketsRes = sprintId
        ? await client.query(
            `select t.*, ws.name as state_name
             from tickets t join workflow_states ws on ws.id = t.state_id
             where t.sprint_id = $1
             order by t.backlog_rank nulls last, t.ticket_number`,
            [sprintId],
          )
        : await client.query(
            `select t.*, ws.name as state_name
             from tickets t
             join workflow_states ws on ws.id = t.state_id
             where t.project_id = $1 and ws.is_terminal = false
             order by t.backlog_rank nulls last, t.ticket_number`,
            [projectId],
          );

      const columnOf = (ticket: any): string | undefined => stateToColumn.get(ticket.state_id);

      const buildColumns = (tickets: any[]) => {
        const ticketsByColumn = new Map<string, any[]>();
        for (const ticket of tickets) {
          const columnId = columnOf(ticket);
          if (!columnId) continue; // state not mapped to any column — excluded, not an error
          if (!ticketsByColumn.has(columnId)) ticketsByColumn.set(columnId, []);
          ticketsByColumn.get(columnId)!.push(ticket);
        }
        return columnsRes.rows.map((col) => {
          const colTickets = ticketsByColumn.get(col.id) ?? [];
          return {
            id: col.id,
            name: col.name,
            position: col.position,
            wipLimit: col.wip_limit,
            ticketCount: colTickets.length,
            wipViolation: col.wip_limit != null && colTickets.length > col.wip_limit,
            tickets: colTickets,
          };
        });
      };

      // §13.2 Swimlanes — no new schema: assignee/epic grouping reuses
      // columns this table already has (assignee_user_id, parent_ticket_id).
      // `groupBy: null` returns the EXACT same `{columns}` shape as before
      // this feature existed — zero behavior change for every caller that
      // doesn't ask for swimlanes.
      if (!groupBy) {
        return { columns: buildColumns(ticketsRes.rows) };
      }

      if (groupBy === 'assignee') {
        const byAssignee = new Map<string, any[]>();
        for (const ticket of ticketsRes.rows) {
          const key = ticket.assignee_user_id ?? 'unassigned';
          if (!byAssignee.has(key)) byAssignee.set(key, []);
          byAssignee.get(key)!.push(ticket);
        }
        return {
          groupBy,
          swimlanes: [...byAssignee.entries()].map(([key, tickets]) => ({
            key,
            label: key === 'unassigned' ? null : key, // resolving a user id -> display name is a frontend concern (it already has the tenant user list); avoids a cross-cutting lookup here
            columns: buildColumns(tickets),
          })),
        };
      }

      // groupBy === 'epic'
      const epicIds = [...new Set(ticketsRes.rows.map((t) => t.parent_ticket_id).filter(Boolean))];
      const epicTitles = new Map<string, string>();
      if (epicIds.length) {
        const epicRes = await client.query(`select id, title from tickets where id = any($1::uuid[])`, [epicIds]);
        for (const row of epicRes.rows) epicTitles.set(row.id, row.title);
      }
      const byEpic = new Map<string, any[]>();
      for (const ticket of ticketsRes.rows) {
        const key = ticket.parent_ticket_id ?? 'no-epic';
        if (!byEpic.has(key)) byEpic.set(key, []);
        byEpic.get(key)!.push(ticket);
      }
      return {
        groupBy,
        swimlanes: [...byEpic.entries()].map(([key, tickets]) => ({
          key,
          label: key === 'no-epic' ? 'No epic' : (epicTitles.get(key) ?? key),
          columns: buildColumns(tickets),
        })),
      };
    });
  }

  /**
   * Full replace of a project's board configuration — deletes every
   * existing column and recreates from `columns`, in the order given.
   * Simpler and less error-prone than granular add/remove/reorder column
   * endpoints for a first cut, at the cost of not being incremental; a
   * board editor UI would just always send the complete desired state,
   * same shape as most "save board layout" flows.
   */
  async replaceColumns(tenantId: string, projectId: string, columns: ColumnInput[]) {
    if (!columns.length) {
      throw new BadRequestException('A board needs at least one column');
    }
    const seenStateIds = new Set<string>();
    for (const col of columns) {
      for (const stateId of col.workflowStateIds) {
        if (seenStateIds.has(stateId)) {
          throw new BadRequestException(
            `workflow state ${stateId} is mapped to more than one column — each state may map to exactly one column`,
          );
        }
        seenStateIds.add(stateId);
      }
    }

    return withTenant(tenantId, async (client) => {
      await client.query(
        `delete from board_columns where project_id = $1`,
        [projectId],
      ); // board_column_states cascades via its FK
      const created = [];
      for (const [i, col] of columns.entries()) {
        const colRes = await client.query(
          `insert into board_columns (tenant_id, project_id, name, position, wip_limit)
           values ($1, $2, $3, $4, $5) returning *`,
          [tenantId, projectId, col.name, i, col.wipLimit],
        );
        for (const stateId of col.workflowStateIds) {
          await client.query(
            `insert into board_column_states (tenant_id, board_column_id, workflow_state_id)
             values ($1, $2, $3)`,
            [tenantId, colRes.rows[0].id, stateId],
          );
        }
        created.push(colRes.rows[0]);
      }
      return created;
    });
  }
}
