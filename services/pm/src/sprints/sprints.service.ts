import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { ENTERED_CURRENT_STATE_AT_SUBQUERY } from '../tickets/tickets.service';

/** Postgres unique_violation error code — used to turn "another sprint is
 *  already active" from a raw constraint error into a clear 400. */
const UNIQUE_VIOLATION = '23505';

@Injectable()
export class SprintsService {
  async create(
    tenantId: string,
    projectId: string,
    name: string,
    goal: string,
    startDate: string | null,
    endDate: string | null,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into sprints (tenant_id, project_id, name, goal, start_date, end_date)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, projectId, name, goal, startDate, endDate],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from sprints where project_id = $1 order by created_at desc`,
        [projectId],
      );
      return rows;
    });
  }

  /** The active sprint's full board: itself plus every ticket currently
   *  assigned to it, joined with its workflow state name — this is the
   *  single call a Scrum/Kanban board view would drive off. */
  async getActiveSprintBoard(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const sprintRes = await client.query(
        `select * from sprints where project_id = $1 and status = 'active' limit 1`,
        [projectId],
      );
      const sprint = sprintRes.rows[0];
      if (!sprint) return { sprint: null, tickets: [] };

      const ticketsRes = await client.query(
        `select t.*, ws.name as state_name
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.sprint_id = $1
         order by t.backlog_rank nulls last, t.ticket_number`,
        [sprint.id],
      );
      return { sprint, tickets: ticketsRes.rows };
    });
  }

  /** A specific sprint's tickets regardless of its status — unlike
   *  getActiveSprintBoard, this works for a completed sprint too, which is
   *  what a burndown chart (services/bi) needs to reconstruct after the
   *  fact. */
  async getSprintTickets(tenantId: string, sprintId: string) {
    return withTenant(tenantId, async (client) => {
      const sprintRes = await client.query(`select * from sprints where id = $1`, [sprintId]);
      const sprint = sprintRes.rows[0];
      if (!sprint) throw new NotFoundException('Sprint not found');

      const ticketsRes = await client.query(
        `select t.*, ws.name as state_name, ws.is_terminal,
                ${ENTERED_CURRENT_STATE_AT_SUBQUERY} as entered_current_state_at
         from tickets t join workflow_states ws on ws.id = t.state_id
         where t.sprint_id = $1
         order by t.ticket_number`,
        [sprintId],
      );
      return { sprint, tickets: ticketsRes.rows };
    });
  }

  /** Planned -> active. Enforced at the DB layer too (idx_sprints_one_active_per_project)
   *  so this can't race with a concurrent start on the same project — the
   *  unique index is the actual guarantee, this check is just a clean error. */
  async start(tenantId: string, sprintId: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from sprints where id = $1`, [sprintId]);
      if (!existing.rows[0]) throw new NotFoundException('Sprint not found');
      if (existing.rows[0].status !== 'planned') {
        throw new BadRequestException(`Sprint is '${existing.rows[0].status}', can only start a 'planned' sprint`);
      }

      try {
        const { rows } = await client.query(
          `update sprints
           set status = 'active', start_date = coalesce(start_date, current_date)
           where id = $1 returning *`,
          [sprintId],
        );
        return rows[0];
      } catch (err: any) {
        if (err?.code === UNIQUE_VIOLATION) {
          throw new BadRequestException(
            'Another sprint on this project is already active — complete it before starting a new one.',
          );
        }
        throw err;
      }
    });
  }

  /**
   * Active -> completed. Every ticket left in this sprint that isn't in a
   * terminal workflow state (i.e. wasn't finished) is carried over — moved
   * to `moveIncompleteToSprintId` if given, otherwise back to the backlog
   * (sprint_id = null) — mirroring Jira's "incomplete issues move to
   * backlog or the next sprint" behavior on sprint completion.
   */
  async complete(tenantId: string, sprintId: string, moveIncompleteToSprintId: string | null) {
    return withTenant(tenantId, async (client) => {
      const sprintRes = await client.query(`select * from sprints where id = $1`, [sprintId]);
      const sprint = sprintRes.rows[0];
      if (!sprint) throw new NotFoundException('Sprint not found');
      if (sprint.status !== 'active') {
        throw new BadRequestException(`Sprint is '${sprint.status}', can only complete an 'active' sprint`);
      }

      const carriedOver = await client.query(
        `update tickets t
         set sprint_id = $1
         from workflow_states ws
         where t.sprint_id = $2
           and t.state_id = ws.id
           and ws.is_terminal = false
         returning t.id`,
        [moveIncompleteToSprintId, sprintId],
      );

      const { rows } = await client.query(
        `update sprints set status = 'completed', completed_at = now() where id = $1 returning *`,
        [sprintId],
      );
      return { sprint: rows[0], carriedOverTicketIds: carriedOver.rows.map((r) => r.id) };
    });
  }

  /**
   * Velocity trend (docs/FEATURES.md §2 "Velocity chart" — previously
   * flagged as trivial-once-real-sprints-exist but never built) — story
   * points completed per completed sprint, oldest first. "Completed"
   * means the ticket's *final* state was terminal when the sprint closed
   * — a ticket carried over mid-sprint and finished in a later sprint
   * counts toward that later sprint, not this one, since sprint_id always
   * reflects a ticket's current assignment, not history. Points are
   * summed from whatever sprint_id a terminal-state ticket sits in today,
   * which is exactly what a completed sprint's carryover logic above
   * already guarantees is correct.
   */
  async getVelocityTrend(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select s.id as sprint_id, s.name as sprint_name, s.completed_at,
                coalesce(sum(t.story_points) filter (where ws.is_terminal), 0) as completed_points
         from sprints s
         left join tickets t on t.sprint_id = s.id
         left join workflow_states ws on ws.id = t.state_id
         where s.project_id = $1 and s.status = 'completed'
         group by s.id, s.name, s.completed_at
         order by s.completed_at asc`,
        [projectId],
      );
      return rows.map((r) => ({
        sprintId: r.sprint_id,
        sprintName: r.sprint_name,
        completedAt: r.completed_at,
        completedPoints: Number(r.completed_points),
      }));
    });
  }
}
