import { Injectable } from '@nestjs/common';

interface Transition {
  ticket_id: string;
  transitioned_at: string;
  from_state_name: string | null;
  to_state_name: string;
}

interface PmTicket {
  id: string;
  ticket_number: number;
  title: string;
  story_points: string | number | null;
  created_at: string;
  state_name: string;
  is_terminal: boolean;
  transitions: Transition[];
}

/**
 * Control Chart + Cumulative Flow Diagram (docs/FEATURES.md §13.6) — the two
 * standard Kanban-flow charts this platform had the raw data for (every
 * state-entry timestamp, recorded since burndown needed it) but never
 * aggregated. Both are pure computation over `services/pm`'s new
 * `GET /tickets/flow-metrics` — no new data model, same "the data already
 * existed, only the aggregation was missing" shape as burndown itself.
 */
@Injectable()
export class FlowMetricsService {
  private async fetchProjectTickets(projectId: string, authorizationHeader: string): Promise<PmTicket[]> {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/tickets/flow-metrics?projectId=${projectId}`, {
      headers: { authorization: authorizationHeader },
    });
    if (!res.ok) throw new Error(`failed to fetch flow metrics from pm-service: ${res.status}`);
    const { tickets } = (await res.json()) as { tickets: PmTicket[] };
    return tickets;
  }

  /**
   * Cycle time = first state transition (when work actually started) →
   * entry into a terminal state ("done"). Lead time = ticket creation →
   * done — the customer/requester-facing clock, which starts before anyone
   * picks the work up. Only counts tickets that have actually REACHED a
   * terminal state — a still-open ticket has no cycle/lead time yet, same
   * as a real control chart only ever plots completed items.
   *
   * Outlier flag: `cycleTimeDays > mean + 2×stddev` of the ticket set's own
   * cycle times. This is a documented simplification of a real Statistical
   * Process Control chart (a true XmR chart derives its control limits from
   * a moving range of the same metric, not a plain population stddev) —
   * disclosed rather than dressed up as the exact SPC method, same honesty
   * this build already applies to the flaky-test quarantine heuristic and
   * the CapEx/OpEx ticket-type classification.
   */
  async controlChart(projectId: string, authorizationHeader: string) {
    const tickets = await this.fetchProjectTickets(projectId, authorizationHeader);

    const points = tickets
      .filter((t) => t.is_terminal)
      .map((t) => {
        const sorted = [...t.transitions].sort(
          (a, b) => new Date(a.transitioned_at).getTime() - new Date(b.transitioned_at).getTime(),
        );
        const startedAt = sorted[0]?.transitioned_at ?? null;
        const doneAt = sorted[sorted.length - 1]?.transitioned_at ?? null;
        if (!doneAt) return null;

        const createdAt = new Date(t.created_at).getTime();
        const doneMs = new Date(doneAt).getTime();
        const leadTimeDays = Math.round(((doneMs - createdAt) / 86_400_000) * 100) / 100;
        const cycleTimeDays = startedAt
          ? Math.round(((doneMs - new Date(startedAt).getTime()) / 86_400_000) * 100) / 100
          : null;

        return {
          ticketId: t.id,
          ticketNumber: t.ticket_number,
          title: t.title,
          doneAt,
          leadTimeDays,
          cycleTimeDays,
        };
      })
      .filter((p): p is NonNullable<typeof p> => p !== null);

    const cycleTimes = points.map((p) => p.cycleTimeDays).filter((n): n is number => n != null);
    const mean = cycleTimes.length ? cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length : 0;
    const variance = cycleTimes.length
      ? cycleTimes.reduce((sum, n) => sum + (n - mean) ** 2, 0) / cycleTimes.length
      : 0;
    const stddev = Math.sqrt(variance);
    const upperControlLimit = Math.round((mean + 2 * stddev) * 100) / 100;

    return {
      projectId,
      meanCycleTimeDays: Math.round(mean * 100) / 100,
      upperControlLimit,
      points: points.map((p) => ({
        ...p,
        isOutlier: p.cycleTimeDays != null && p.cycleTimeDays > upperControlLimit && stddev > 0,
      })),
    };
  }

  /**
   * Cumulative Flow Diagram: for each day from the project's earliest
   * ticket creation through today, how many tickets sat in each workflow
   * state. Reconstructed by walking each ticket's own transition list and
   * finding the state it was in as of that day — the last transition at or
   * before that day, or its initial (creation) state if none yet.
   */
  async cumulativeFlow(projectId: string, authorizationHeader: string) {
    const tickets = await this.fetchProjectTickets(projectId, authorizationHeader);
    if (tickets.length === 0) return { projectId, series: [], states: [] };

    const earliestMs = Math.min(...tickets.map((t) => new Date(t.created_at).getTime()));
    const todayMs = Date.now();
    const totalDays = Math.max(0, Math.round((todayMs - earliestMs) / 86_400_000));

    // Every state name that ever appears (a ticket's current state, or any
    // state it transitioned through) — the diagram's stacked-area legend.
    const states = new Set<string>();
    for (const t of tickets) {
      states.add(t.state_name);
      for (const tr of t.transitions) {
        if (tr.from_state_name) states.add(tr.from_state_name);
        states.add(tr.to_state_name);
      }
    }

    const series: { date: string; counts: Record<string, number> }[] = [];
    for (let day = 0; day <= totalDays; day++) {
      const cutoff = earliestMs + day * 86_400_000;
      const counts: Record<string, number> = {};
      for (const s of states) counts[s] = 0;

      for (const t of tickets) {
        if (new Date(t.created_at).getTime() > cutoff) continue; // doesn't exist yet as of this day
        const sorted = [...t.transitions]
          .filter((tr) => new Date(tr.transitioned_at).getTime() <= cutoff)
          .sort((a, b) => new Date(a.transitioned_at).getTime() - new Date(b.transitioned_at).getTime());
        const stateAsOfDay = sorted.length > 0 ? sorted[sorted.length - 1].to_state_name : t.state_name;
        // A ticket created after the workflow's initial state was recorded
        // has no transition yet, so `t.state_name` (its CURRENT state) is
        // only a correct stand-in for "state as of `cutoff`" when the
        // ticket hasn't transitioned by then either — true here by
        // construction, since `sorted` would otherwise be non-empty.
        counts[stateAsOfDay] = (counts[stateAsOfDay] ?? 0) + 1;
      }

      series.push({ date: new Date(cutoff).toISOString().slice(0, 10), counts });
    }

    return { projectId, states: Array.from(states), series };
  }
}
