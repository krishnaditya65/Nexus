import { BadRequestException, Injectable } from '@nestjs/common';

interface PmTicket {
  id: string;
  state_name: string;
  updated_at: string;
  entered_current_state_at: string | null;
}

const SIMULATION_RUNS = 10_000;

/**
 * Monte Carlo delivery forecasting: samples historical weekly throughput
 * (with replacement) to simulate thousands of possible futures, then reports
 * the week count at which 50%/85%/95% of simulated futures had finished —
 * "85% chance this Epic finishes by <date>" from the original spec.
 *
 * Historical throughput is derived from services/pm's tickets directly
 * (fetched live, not duplicated into this service's own tables), keyed by
 * `entered_current_state_at` — the exact timestamp services/pm's
 * `ticket_state_transitions` history table records for when a ticket most
 * recently entered its current (terminal) state. This used to be
 * approximated via `updated_at`, which was wrong two ways: it bumps on
 * any field edit (assignee, story points, title), not just a state
 * change, and only ever reflected a ticket's LAST bounce through a state.
 * `entered_current_state_at` falls back to `updated_at` only for tickets
 * completed before this table existed (no transition row to look up).
 */
@Injectable()
export class ForecastingService {
  async forecast(tenantId: string, projectId: string, authorizationHeader: string, remainingOverride?: number) {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/tickets?projectId=${projectId}`, {
      headers: { authorization: authorizationHeader },
    });
    if (!res.ok) throw new Error(`failed to fetch tickets from pm-service: ${res.status}`);
    const tickets = (await res.json()) as PmTicket[];

    const terminalStates = new Set(['Done']); // matches services/pm's default seeded workflow
    const completed = tickets.filter((t) => terminalStates.has(t.state_name));
    const remaining = remainingOverride ?? tickets.length - completed.length;

    if (remaining <= 0) {
      return { alreadyComplete: true, remaining: 0 };
    }

    const weeklyThroughput = this.computeWeeklyThroughput(completed);
    if (weeklyThroughput.length < 2) {
      throw new BadRequestException(
        'not enough completed-ticket history to forecast (need at least 2 weeks of throughput data)',
      );
    }

    const weeksToFinish: number[] = [];
    for (let sim = 0; sim < SIMULATION_RUNS; sim++) {
      let done = 0;
      let weeks = 0;
      while (done < remaining && weeks < 500) {
        // sample WITH replacement from observed weekly throughput — the core
        // Monte Carlo step: each simulated future draws a plausible week's
        // output from what this team has actually demonstrated historically.
        const sampledWeek = weeklyThroughput[Math.floor(Math.random() * weeklyThroughput.length)];
        done += sampledWeek;
        weeks++;
      }
      weeksToFinish.push(weeks);
    }
    weeksToFinish.sort((a, b) => a - b);

    const percentile = (p: number) => weeksToFinish[Math.floor(weeksToFinish.length * p)];
    const weeksFromNow = (weeks: number) => {
      const d = new Date();
      d.setDate(d.getDate() + weeks * 7);
      return d.toISOString().slice(0, 10);
    };

    return {
      remaining,
      historicalWeeklyThroughput: weeklyThroughput,
      simulationRuns: SIMULATION_RUNS,
      confidence: {
        p50: { weeks: percentile(0.5), date: weeksFromNow(percentile(0.5)) },
        p85: { weeks: percentile(0.85), date: weeksFromNow(percentile(0.85)) },
        p95: { weeks: percentile(0.95), date: weeksFromNow(percentile(0.95)) },
      },
    };
  }

  private computeWeeklyThroughput(completed: PmTicket[]): number[] {
    const byWeek = new Map<string, number>();
    for (const ticket of completed) {
      const d = new Date(ticket.entered_current_state_at ?? ticket.updated_at);
      const day = d.getUTCDay();
      d.setUTCDate(d.getUTCDate() + ((day === 0 ? -6 : 1) - day)); // Monday of that week
      const key = d.toISOString().slice(0, 10);
      byWeek.set(key, (byWeek.get(key) ?? 0) + 1);
    }
    return Array.from(byWeek.values());
  }
}
