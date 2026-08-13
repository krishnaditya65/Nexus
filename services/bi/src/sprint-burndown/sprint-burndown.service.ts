import { BadRequestException, Injectable } from '@nestjs/common';

interface PmTicket {
  id: string;
  story_points: string | number | null;
  state_name: string;
  is_terminal: boolean;
  updated_at: string;
  created_at?: string;
  entered_current_state_at: string | null;
}

interface PmSprint {
  id: string;
  status: 'planned' | 'active' | 'completed';
  start_date: string | null;
  end_date: string | null;
}

/**
 * Sprint burndown: the other half of Jira/ADO agile parity alongside
 * services/pm's sprints themselves (see that service's SprintsService
 * docblock) — the chart every daily standup looks at. Computes the ideal
 * remaining-points line (linear from total points to zero across the
 * sprint's date range) against the actual remaining-points line
 * (reconstructed from each ticket's completion date).
 *
 * "When did this ticket actually finish" comes from
 * `entered_current_state_at` — services/pm's exact timestamp for a
 * ticket's most recent entry into its current state, backed by the
 * `ticket_state_transitions` history table (see ForecastingService's
 * docblock, which shares this same fix: this used to be approximated via
 * `updated_at`, which bumps on any field edit and only reflects a
 * ticket's last bounce through a state, not its true completion date).
 */
@Injectable()
export class SprintBurndownService {
  async burndown(tenantId: string, sprintId: string, authorizationHeader: string) {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/sprints/${sprintId}/tickets`, {
      headers: { authorization: authorizationHeader },
    });
    if (!res.ok) throw new Error(`failed to fetch sprint tickets from pm-service: ${res.status}`);
    const { sprint, tickets } = (await res.json()) as { sprint: PmSprint; tickets: PmTicket[] };

    if (!sprint.start_date || !sprint.end_date) {
      throw new BadRequestException('Sprint has no start_date/end_date set — burndown needs both.');
    }

    const pointsOf = (t: PmTicket) => (t.story_points == null ? 0 : Number(t.story_points));
    const totalPoints = tickets.reduce((sum, t) => sum + pointsOf(t), 0);

    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

    // Ideal line: straight-line burn from totalPoints on day 0 to 0 on the
    // last day — the textbook Scrum burndown reference line.
    const idealByDay: number[] = [];
    for (let day = 0; day <= totalDays; day++) {
      idealByDay.push(totalPoints * (1 - day / totalDays));
    }

    // Actual line: for each day, sum points of tickets NOT YET finished as
    // of that day (finished = terminal state, dated by the exact
    // entered_current_state_at timestamp documented above). A ticket
    // finished before the sprint even started (data-entry edge case)
    // counts as burned from day 0.
    const actualByDay: number[] = [];
    for (let day = 0; day <= totalDays; day++) {
      const cutoff = new Date(start.getTime() + day * 86_400_000);
      const remaining = tickets
        .filter((t) => {
          if (!t.is_terminal) return true;
          return new Date(t.entered_current_state_at ?? t.updated_at) > cutoff;
        })
        .reduce((sum, t) => sum + pointsOf(t), 0);
      actualByDay.push(remaining);
    }

    return {
      sprintId,
      totalPoints,
      startDate: sprint.start_date,
      endDate: sprint.end_date,
      // Today's actual point is only meaningful up through the current
      // day for an active sprint — the caller (a burndown chart) is
      // expected to stop plotting `actual` past "today" itself.
      series: idealByDay.map((ideal, day) => ({
        day,
        date: new Date(start.getTime() + day * 86_400_000).toISOString().slice(0, 10),
        idealRemaining: Math.round(ideal * 100) / 100,
        actualRemaining: actualByDay[day],
      })),
    };
  }

  /**
   * Burnup (docs/FEATURES.md §13.6) — burndown's scope-creep-aware
   * companion: a "completed" line that only ever goes up, plotted against
   * a "total scope" line that ALSO can go up if tickets are added to the
   * sprint mid-flight, instead of burndown's single "remaining" line that
   * conflates "we finished work" with "scope shrank." Same underlying
   * ticket data as `burndown()` above, different two lines.
   *
   * **Disclosed approximation**: "total scope as of day N" is derived from
   * each ticket's own `created_at`, not a separately tracked "date added
   * to THIS sprint" — a ticket created earlier and moved into this sprint
   * later would appear to have been in scope from day 0. This platform's
   * schema doesn't track sprint-membership-changed-at, only sprint_id's
   * current value, so a fully accurate scope-added-mid-sprint line isn't
   * available yet; this is directionally correct (a ticket created after
   * the sprint started is definitely scope creep) but can undercount it
   * for tickets moved in from elsewhere, stated here rather than silently
   * assumed exact.
   */
  async burnup(tenantId: string, sprintId: string, authorizationHeader: string) {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/sprints/${sprintId}/tickets`, {
      headers: { authorization: authorizationHeader },
    });
    if (!res.ok) throw new Error(`failed to fetch sprint tickets from pm-service: ${res.status}`);
    const { sprint, tickets } = (await res.json()) as { sprint: PmSprint; tickets: PmTicket[] };

    if (!sprint.start_date || !sprint.end_date) {
      throw new BadRequestException('Sprint has no start_date/end_date set — burnup needs both.');
    }

    const pointsOf = (t: PmTicket) => (t.story_points == null ? 0 : Number(t.story_points));
    const start = new Date(sprint.start_date);
    const end = new Date(sprint.end_date);
    const totalDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));

    const series = [];
    for (let day = 0; day <= totalDays; day++) {
      const cutoff = new Date(start.getTime() + day * 86_400_000);
      const scopePoints = tickets
        .filter((t) => new Date(t.created_at ?? sprint.start_date!) <= cutoff)
        .reduce((sum, t) => sum + pointsOf(t), 0);
      const completedPoints = tickets
        .filter((t) => t.is_terminal && new Date(t.entered_current_state_at ?? t.updated_at) <= cutoff)
        .reduce((sum, t) => sum + pointsOf(t), 0);
      series.push({
        day,
        date: cutoff.toISOString().slice(0, 10),
        scopePoints,
        completedPoints,
      });
    }

    return { sprintId, startDate: sprint.start_date, endDate: sprint.end_date, series };
  }
}
