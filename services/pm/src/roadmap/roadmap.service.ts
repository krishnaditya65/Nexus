import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { computeAutoSchedule, SchedulableEpic } from './auto-schedule';

const DEFAULT_SPRINT_LENGTH_DAYS = 14;

/**
 * Advanced Roadmaps auto-scheduling (docs/FEATURES.md §13.4) — the
 * database-facing half; `computeAutoSchedule` (auto-schedule.ts) is the
 * actual algorithm, kept dependency-free and unit-tested on its own.
 * This service's job is entirely: gather real epics/dependencies/velocity
 * for a delivery plan's projects, hand them to the pure function, and
 * convert its sprint-index output into real calendar dates.
 */
@Injectable()
export class RoadmapService {
  /**
   * Preview only — never writes. `apply()` below is the separate,
   * explicit write path (owner/admin gated), same "compute first, persist
   * only on confirmation" split as everywhere else a computed result
   * could silently overwrite user data in this build.
   */
  async previewAutoSchedule(
    tenantId: string,
    planId: string,
    options: { anchorDate?: string; sprintLengthDays?: number; velocityOverride?: number } = {},
  ) {
    return withTenant(tenantId, async (client) => {
      const planRes = await client.query(`select * from delivery_plans where id = $1`, [planId]);
      const plan = planRes.rows[0];
      if (!plan) throw new NotFoundException('Delivery plan not found');

      const { rows: epics } = await client.query(
        `select t.id, t.title, t.project_id, p.key as project_key,
                coalesce(sum(c.story_points), 0) as points
         from tickets t
         join projects p on p.id = t.project_id
         left join tickets c on c.parent_ticket_id = t.id
         where t.project_id = any($1) and t.type = 'epic'
         group by t.id, t.title, t.project_id, p.key
         order by t.ticket_number`,
        [plan.project_ids],
      );
      if (epics.length === 0) {
        return { schedule: [], warnings: ['This plan has no epics to schedule.'] };
      }
      const epicIds = epics.map((e) => e.id);

      // 'blocks' edges where BOTH ends are epics in this set — a
      // dependency on a ticket outside the epic set (e.g. a plain story)
      // isn't a cross-epic sequencing constraint this algorithm reasons
      // about; computeAutoSchedule already no-ops on an unknown id, this
      // filter just avoids fetching rows it would discard anyway.
      const { rows: links } = await client.query(
        `select source_ticket_id, target_ticket_id from ticket_links
         where link_type = 'blocks' and source_ticket_id = any($1) and target_ticket_id = any($1)`,
        [epicIds],
      );
      const dependsOn = new Map<string, string[]>();
      for (const l of links) {
        // source BLOCKS target => target depends on source finishing first.
        const arr = dependsOn.get(l.target_ticket_id) ?? [];
        arr.push(l.source_ticket_id);
        dependsOn.set(l.target_ticket_id, arr);
      }

      const schedulable: SchedulableEpic[] = epics.map((e) => ({
        id: e.id,
        points: Number(e.points),
        dependsOn: dependsOn.get(e.id) ?? [],
      }));

      // Shared team velocity — the sum of each project-on-this-plan's
      // average completed-sprint points over its last 5 completed
      // sprints (0 for a project with no completed sprints yet, not an
      // error — a brand-new project just contributes no capacity until
      // it has a track record). Callers can override entirely via
      // `velocityOverride` for a what-if scenario.
      let velocityPerSprint = options.velocityOverride;
      if (velocityPerSprint == null) {
        const { rows: velocityRows } = await client.query(
          `select project_id, avg(points) as avg_points from (
             select s.project_id, coalesce(sum(t.story_points) filter (where ws.is_terminal), 0) as points
             from sprints s
             left join tickets t on t.sprint_id = s.id
             left join workflow_states ws on ws.id = t.state_id
             where s.project_id = any($1) and s.status = 'completed'
             group by s.id, s.project_id
             order by s.completed_at desc
             limit 5
           ) recent
           group by project_id`,
          [plan.project_ids],
        );
        velocityPerSprint = velocityRows.reduce((sum: number, r: any) => sum + Number(r.avg_points), 0);
      }

      const sprintLengthDays = options.sprintLengthDays ?? DEFAULT_SPRINT_LENGTH_DAYS;
      const anchor = options.anchorDate ? new Date(options.anchorDate) : new Date();
      if (Number.isNaN(anchor.getTime())) throw new BadRequestException('Invalid anchorDate');

      const { schedule, warnings } = computeAutoSchedule(schedulable, velocityPerSprint);
      if (velocityPerSprint === 0) {
        warnings.push('Computed team velocity is 0 (no completed sprints yet) — dates are placeholders, not a real forecast.');
      }

      const byId = new Map(epics.map((e) => [e.id, e]));
      const result = schedule.map((s) => {
        const epic = byId.get(s.id)!;
        const startDate = addDays(anchor, s.startSprintIndex * sprintLengthDays);
        const endDate = addDays(anchor, (s.endSprintIndex + 1) * sprintLengthDays);
        return {
          epicId: s.id,
          epicTitle: epic.title,
          projectKey: epic.project_key,
          startDate: startDate.toISOString().slice(0, 10),
          endDate: endDate.toISOString().slice(0, 10),
        };
      });

      return { schedule: result, warnings, velocityPerSprint, sprintLengthDays };
    });
  }

  /** Writes each scheduled epic's computed end date to `tickets.due_date`
   *  — reuses existing schema (no new column) the same way §13.2's
   *  swimlanes and §13.5's Development Panel reused what already existed.
   *  Deliberately does NOT write a start date (no `tickets.start_date`
   *  column exists) — see epics.service.ts's docblock on that same gap. */
  async applyAutoSchedule(tenantId: string, planId: string, options: Parameters<RoadmapService['previewAutoSchedule']>[2] = {}) {
    const preview = await this.previewAutoSchedule(tenantId, planId, options);
    return withTenant(tenantId, async (client) => {
      for (const s of preview.schedule) {
        await client.query(`update tickets set due_date = $1, updated_at = now() where id = $2`, [s.endDate, s.epicId]);
      }
      return preview;
    });
  }
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}
