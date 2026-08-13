import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

interface PmTicket {
  id: string;
  type: string;
  title: string;
  state_name: string;
}

/**
 * Requirement Traceability Matrix: for every requirement-typed ticket in a
 * project (read live from services/pm, not duplicated here), reports
 * whether a linked test case exists and its latest execution status. This
 * is the compliance artifact the original spec described as proving "every
 * Business Requirement ticket has corresponding Code, passing Tests, and a
 * Release sign-off" — the Code/Release portions of that chain live in
 * services/git-host and services/pm respectively and aren't joined in here
 * yet, tracked in docs/ROADMAP.md.
 */
@Injectable()
export class RtmService {
  async generate(tenantId: string, projectId: string, authorizationHeader: string) {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/tickets?projectId=${projectId}`, {
      headers: { authorization: authorizationHeader },
    });
    if (!res.ok) throw new Error(`failed to fetch tickets from pm-service: ${res.status}`);
    const tickets = (await res.json()) as PmTicket[];

    const requirementTickets = tickets.filter((t) => t.type === 'requirement');

    return withTenant(tenantId, async (client) => {
      const rows = [];
      for (const ticket of requirementTickets) {
        const caseRes = await client.query(
          `select tc.id, tc.title,
             (select status from test_executions where test_case_id = tc.id order by executed_at desc limit 1) as latest_status
           from test_cases tc
           where tc.requirement_ticket_id = $1`,
          [ticket.id],
        );
        rows.push({
          requirementTicketId: ticket.id,
          requirementTitle: ticket.title,
          requirementState: ticket.state_name,
          linkedTestCases: caseRes.rows,
          coverageStatus:
            caseRes.rows.length === 0
              ? 'no_tests'
              : caseRes.rows.every((c) => c.latest_status === 'passed')
                ? 'fully_passing'
                : 'has_failures_or_untested',
        });
      }
      return rows;
    });
  }
}
