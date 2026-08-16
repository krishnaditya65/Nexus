import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { parseGherkin } from '../gherkin/gherkin';

interface PmRelease {
  id: string;
  name: string;
  status: string;
}

@Injectable()
export class TestPlansService {
  /**
   * `release_ref` used to be a free-text string with nothing checking it
   * named a real release — this validates it against services/pm's real
   * Releases (§11.2) before storing, live over HTTP (test plans tied to
   * releases was explicitly blocked on that feature existing at all,
   * which it now does). A releaseRef that doesn't resolve to a real
   * release in this tenant is rejected outright rather than silently
   * stored as a dangling reference.
   */
  async create(
    tenantId: string,
    projectId: string,
    name: string,
    releaseRef: string | undefined,
    authorizationHeader: string,
  ) {
    if (releaseRef) {
      await this.fetchRelease(releaseRef, authorizationHeader);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into test_plans (tenant_id, project_id, name, release_ref) values ($1, $2, $3, $4) returning *`,
        [tenantId, projectId, name, releaseRef ?? null],
      );
      return rows[0];
    });
  }

  private async fetchRelease(releaseId: string, authorizationHeader: string): Promise<PmRelease> {
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
    const res = await fetch(`${pmServiceUrl}/releases/${encodeURIComponent(releaseId)}`, {
      headers: { authorization: authorizationHeader },
    });
    if (res.status === 404) throw new BadRequestException(`releaseRef '${releaseId}' does not name a real release`);
    if (!res.ok) throw new Error(`failed to fetch release from pm-service: ${res.status}`);
    return res.json() as Promise<PmRelease>;
  }

  /** Enriches a list of test plans with each releaseRef's real, live
   *  name/status from pm — fetched per distinct release, not per plan,
   *  so N plans tied to the same release cost one HTTP round trip, not N. */
  private async enrichWithReleases<T extends { release_ref: string | null }>(
    plans: T[],
    authorizationHeader: string,
  ): Promise<(T & { release: PmRelease | null })[]> {
    const distinctIds = [...new Set(plans.map((p) => p.release_ref).filter((id): id is string => !!id))];
    const releases = new Map<string, PmRelease>();
    for (const id of distinctIds) {
      try {
        releases.set(id, await this.fetchRelease(id, authorizationHeader));
      } catch {
        // A release that's since been deleted shouldn't break the whole
        // list — the plan just renders with release: null, same as any
        // other dangling-reference tolerance elsewhere in this platform.
      }
    }
    return plans.map((p) => ({ ...p, release: p.release_ref ? (releases.get(p.release_ref) ?? null) : null }));
  }

  async list(tenantId: string, projectId: string, authorizationHeader: string) {
    const rows = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from test_plans where tenant_id = $1 and project_id = $2 order by created_at desc`,
        [tenantId, projectId],
      );
      return rows;
    });
    return this.enrichWithReleases(rows, authorizationHeader);
  }

  async addCase(tenantId: string, planId: string, title: string, gherkinText?: string, requirementTicketId?: string) {
    // Parsed eagerly so a malformed scenario fails fast at creation time
    // rather than silently storing something the RTM/report layer can't read.
    if (gherkinText) parseGherkin(gherkinText);

    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into test_cases (tenant_id, plan_id, title, gherkin_text, requirement_ticket_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, planId, title, gherkinText ?? null, requirementTicketId ?? null],
      );
      return rows[0];
    });
  }

  async listCases(tenantId: string, planId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from test_cases where plan_id = $1 order by created_at`, [
        planId,
      ]);
      return rows.map((row) => ({
        ...row,
        parsedGherkin: row.gherkin_text ? parseGherkin(row.gherkin_text) : null,
      }));
    });
  }

  /**
   * Progress report (docs/FEATURES.md §10 "Test Plans > Progress report")
   * — pass/fail/untested breakdown across every plan in a project. Same
   * "latest execution per case" join RTM's coverage computation already
   * uses (see rtm.service.ts), just aggregated by plan instead of by
   * requirement.
   */
  async progressReport(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select tp.id as plan_id, tp.name as plan_name,
                tc.id as case_id,
                (select status from test_executions where test_case_id = tc.id order by executed_at desc limit 1) as latest_status
         from test_plans tp
         left join test_cases tc on tc.plan_id = tp.id
         where tp.tenant_id = $1 and tp.project_id = $2
         order by tp.created_at`,
        [tenantId, projectId],
      );

      const byPlan = new Map<string, { planId: string; planName: string; passed: number; failed: number; untested: number; total: number }>();
      for (const row of rows) {
        if (!byPlan.has(row.plan_id)) {
          byPlan.set(row.plan_id, { planId: row.plan_id, planName: row.plan_name, passed: 0, failed: 0, untested: 0, total: 0 });
        }
        const entry = byPlan.get(row.plan_id)!;
        if (!row.case_id) continue; // plan has no cases yet — leave all counts at 0
        entry.total += 1;
        if (row.latest_status === 'passed') entry.passed += 1;
        else if (row.latest_status === 'failed') entry.failed += 1;
        else entry.untested += 1;
      }
      return Array.from(byPlan.values());
    });
  }
}
