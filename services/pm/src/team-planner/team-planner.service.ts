import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class TeamPlannerService {
  async setCapacity(tenantId: string, sprintId: string, userId: string, capacityPoints: number) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into sprint_capacities (tenant_id, sprint_id, user_id, capacity_points)
         values ($1, $2, $3, $4)
         on conflict (sprint_id, user_id) do update set capacity_points = excluded.capacity_points, updated_at = now()
         returning *`,
        [tenantId, sprintId, userId, capacityPoints],
      );
      return rows[0];
    });
  }

  /** Merges each person's set capacity with what's actually allocated to
   *  them (sum of story_points on tickets in this sprint) — the same
   *  "capacity vs allocated" view ADO's Team Planner shows, just in
   *  points instead of hours. A person can appear here with allocated
   *  work and no capacity row yet (nobody's set it) — shown as 0
   *  capacity, not omitted, since "over their unset capacity" is exactly
   *  the signal a planner needs to go set one. */
  async getPlan(tenantId: string, sprintId: string) {
    return withTenant(tenantId, async (client) => {
      const capacitiesRes = await client.query(
        `select user_id, capacity_points from sprint_capacities where sprint_id = $1`,
        [sprintId],
      );
      const allocatedRes = await client.query(
        `select assignee_user_id as user_id,
                coalesce(sum(story_points), 0) as allocated_points,
                count(*) as ticket_count
         from tickets
         where sprint_id = $1 and assignee_user_id is not null
         group by assignee_user_id`,
        [sprintId],
      );

      const byUser = new Map<string, { userId: string; capacityPoints: number; allocatedPoints: number; ticketCount: number }>();
      for (const row of capacitiesRes.rows) {
        byUser.set(row.user_id, {
          userId: row.user_id,
          capacityPoints: Number(row.capacity_points),
          allocatedPoints: 0,
          ticketCount: 0,
        });
      }
      for (const row of allocatedRes.rows) {
        const existing = byUser.get(row.user_id);
        if (existing) {
          existing.allocatedPoints = Number(row.allocated_points);
          existing.ticketCount = Number(row.ticket_count);
        } else {
          byUser.set(row.user_id, {
            userId: row.user_id,
            capacityPoints: 0,
            allocatedPoints: Number(row.allocated_points),
            ticketCount: Number(row.ticket_count),
          });
        }
      }

      return Array.from(byUser.values())
        .map((entry) => ({ ...entry, isOverallocated: entry.allocatedPoints > entry.capacityPoints }))
        .sort((a, b) => b.allocatedPoints - a.allocatedPoints);
    });
  }

  /**
   * Cross-project CAPACITY rollup (docs/FEATURES.md §12.9) — previously
   * left unbuilt because it "needs a well-defined 'what is this project's
   * currently active sprint' concept... and projects on different sprint
   * cadences/lengths don't have one obvious answer." Revisited: that
   * concept already exists and is already enforced — `sprints` has a
   * real `idx_sprints_one_active_per_project` unique index (see
   * `SprintsService.start`'s docblock), so "this project's current
   * sprint" is unambiguous by construction: at most one `status =
   * 'active'` row per project, full stop, regardless of cadence/length —
   * there was never actually a missing definition, just an unexamined
   * one. A project with no active sprint (nothing started yet, or
   * between sprints) contributes `sprintId: null` and is EXCLUDED from
   * the totals but still listed — visible, not silently dropped, same
   * "don't hide a gap as a zero" discipline as `services/compliance`'s
   * retention-purge rejection message.
   *
   * Deliberately NOT a new aggregation query duplicating `getPlan`'s
   * math: this computes the same capacity-vs-allocated sums `getPlan`
   * does, just batched across every active sprint at once (one query per
   * metric, not N+1 per project) — same "can never drift from the
   * per-project view" reasoning as `services/bi`'s
   * `portfolioCostReport()`.
   */
  async portfolioCapacityRollup(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const projectsRes = await client.query(
        `select p.id as project_id, p.name as project_name, s.id as sprint_id, s.name as sprint_name
         from projects p
         left join sprints s on s.project_id = p.id and s.status = 'active'
         where p.tenant_id = $1
         order by p.name`,
        [tenantId],
      );

      const sprintIds = projectsRes.rows.filter((r) => r.sprint_id).map((r) => r.sprint_id);
      const capacityBySprint = new Map<string, number>();
      const allocatedBySprint = new Map<string, number>();

      if (sprintIds.length > 0) {
        const capRes = await client.query(
          `select sprint_id, coalesce(sum(capacity_points), 0) as total_capacity
           from sprint_capacities where sprint_id = any($1) group by sprint_id`,
          [sprintIds],
        );
        for (const row of capRes.rows) capacityBySprint.set(row.sprint_id, Number(row.total_capacity));

        const allocRes = await client.query(
          `select sprint_id, coalesce(sum(story_points), 0) as total_allocated
           from tickets where sprint_id = any($1) and assignee_user_id is not null group by sprint_id`,
          [sprintIds],
        );
        for (const row of allocRes.rows) allocatedBySprint.set(row.sprint_id, Number(row.total_allocated));
      }

      const perProject = projectsRes.rows.map((r) => ({
        projectId: r.project_id,
        projectName: r.project_name,
        sprintId: r.sprint_id ?? null,
        sprintName: r.sprint_name ?? null,
        capacityPoints: r.sprint_id ? (capacityBySprint.get(r.sprint_id) ?? 0) : null,
        allocatedPoints: r.sprint_id ? (allocatedBySprint.get(r.sprint_id) ?? 0) : null,
      }));

      const withActiveSprint = perProject.filter((p) => p.sprintId !== null);
      const totalCapacityPoints = withActiveSprint.reduce((sum, p) => sum + (p.capacityPoints ?? 0), 0);
      const totalAllocatedPoints = withActiveSprint.reduce((sum, p) => sum + (p.allocatedPoints ?? 0), 0);

      return {
        projectCount: perProject.length,
        projectsWithActiveSprint: withActiveSprint.length,
        totalCapacityPoints,
        totalAllocatedPoints,
        perProject,
      };
    });
  }
}
