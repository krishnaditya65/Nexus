import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { RateCardsService } from './rate-cards.service';

interface PmTicket {
  id: string;
  type: string;
}

// CapEx/OpEx classification is a straightforward rule, not real tax/
// accounting advice: net-new capability (feature/epic work) is treated
// as capitalizable, everything else (bugs, chores, maintenance,
// requirements-gathering) as operating expense. Same "the label does a
// lot of work at this scope" honesty this codebase already uses for the
// flaky-test quarantine heuristic — swap in a real accounting rule set
// once a tenant's actual finance team defines one; this is a genuinely
// useful default, not a compliance-grade categorization.
const CAPEX_TICKET_TYPES = new Set(['feature', 'epic']);

// Pulled out as standalone, exported, pure functions — the actual decision
// logic worth guarding with a regression test — so they're unit-testable
// without a database or a live pm-service. See cost-report.service.spec.ts.
export function isCapexTicketType(ticketType: string | undefined): boolean {
  return !!ticketType && CAPEX_TICKET_TYPES.has(ticketType);
}

export function costCentsFor(minutes: number, rateCentsPerHour: number): number {
  return Math.round((minutes / 60) * rateCentsPerHour);
}

@Injectable()
export class CostReportService {
  constructor(private readonly rateCards: RateCardsService) {}

  /**
   * Real dollar cost from real logged time: pulls every ticket in the
   * project from services/pm (live, not duplicated), pulls every
   * time_entry against one of those tickets in the date range, prices
   * each entry at its logger's hourly rate (entries from a user with no
   * rate card set are excluded from the dollar total but still counted
   * separately as `uncostedMinutes`, so a report never silently
   * understates itself without saying so), and splits the total into
   * capex/opex by the ticket's type.
   */
  async costReport(
    tenantId: string,
    projectId: string,
    startDate: string,
    endDate: string,
    authorizationHeader: string,
  ) {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/tickets?projectId=${projectId}`, {
      headers: { authorization: authorizationHeader },
    });
    if (!res.ok) throw new Error(`failed to fetch tickets from pm-service: ${res.status}`);
    const tickets = (await res.json()) as PmTicket[];
    const ticketIds = tickets.map((t) => t.id);
    const typeByTicket = new Map(tickets.map((t) => [t.id, t.type]));

    const rates = await this.rateCards.ratesByUser(tenantId);

    const entries = await withTenant(tenantId, async (client) => {
      if (ticketIds.length === 0) return [];
      const { rows } = await client.query(
        `select * from time_entries
         where tenant_id = $1 and ticket_id = any($2) and entry_date >= $3::date and entry_date <= $4::date`,
        [tenantId, ticketIds, startDate, endDate],
      );
      return rows;
    });

    let capexCents = 0;
    let opexCents = 0;
    let uncostedMinutes = 0;
    const byUser = new Map<string, { minutes: number; costCents: number }>();

    for (const entry of entries) {
      const rateCentsPerHour = rates.get(entry.user_id);
      const userAgg = byUser.get(entry.user_id) ?? { minutes: 0, costCents: 0 };
      userAgg.minutes += entry.minutes;

      if (rateCentsPerHour == null) {
        uncostedMinutes += entry.minutes;
        byUser.set(entry.user_id, userAgg);
        continue;
      }

      const costCents = costCentsFor(entry.minutes, rateCentsPerHour);
      userAgg.costCents += costCents;
      byUser.set(entry.user_id, userAgg);

      const ticketType = entry.ticket_id ? typeByTicket.get(entry.ticket_id) : undefined;
      if (isCapexTicketType(ticketType)) capexCents += costCents;
      else opexCents += costCents;
    }

    return {
      projectId,
      startDate,
      endDate,
      totalCostCents: capexCents + opexCents,
      capexCents,
      opexCents,
      uncostedMinutes,
      byUser: Array.from(byUser.entries()).map(([userId, agg]) => ({ userId, ...agg })),
    };
  }

  /**
   * §12.9 portfolio-level rollup — every project's real cost report,
   * summed. Deliberately NOT a new aggregation query: it fetches the
   * tenant's real project list from services/pm and calls the SAME
   * costReport() above once per project, so a portfolio total can never
   * drift from what each project's own report already shows (no
   * duplicated cost-computation logic to keep in sync). Honest, disclosed
   * scope: this covers the budget/cost half of §12.9's "capacity + budget
   * rollup" ask — a cross-project CAPACITY rollup needs "what is each
   * project's currently active sprint," which isn't a well-defined
   * concept across projects on different sprint cadences, and is left as
   * explicit follow-up rather than a shaky heuristic.
   */
  async portfolioCostReport(tenantId: string, startDate: string, endDate: string, authorizationHeader: string) {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/projects`, { headers: { authorization: authorizationHeader } });
    if (!res.ok) throw new Error(`failed to fetch projects from pm-service: ${res.status}`);
    const projects = (await res.json()) as Array<{ id: string; key: string; name: string }>;

    const perProject = await Promise.all(
      projects.map(async (p) => {
        const { projectId, ...report } = await this.costReport(tenantId, p.id, startDate, endDate, authorizationHeader);
        return { projectId, projectKey: p.key, projectName: p.name, ...report };
      }),
    );

    return {
      startDate,
      endDate,
      projectCount: perProject.length,
      totalCostCents: perProject.reduce((sum, r) => sum + r.totalCostCents, 0),
      capexCents: perProject.reduce((sum, r) => sum + r.capexCents, 0),
      opexCents: perProject.reduce((sum, r) => sum + r.opexCents, 0),
      uncostedMinutes: perProject.reduce((sum, r) => sum + r.uncostedMinutes, 0),
      byProject: perProject,
    };
  }
}
