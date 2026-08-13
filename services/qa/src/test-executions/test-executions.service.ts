import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { parseJUnitXml } from './junit-parser';

const FLAKY_DETECTION_WINDOW = 5;

@Injectable()
export class TestExecutionsService {
  /**
   * Ingests a JUnit XML report against a plan: each `<testcase>` is
   * matched to an existing test_case by title, or created if this is the
   * first time this runner has reported it (auto-discovery — a tenant
   * doesn't have to hand-author a test_case for every existing automated
   * test before ingestion works). Runs flaky detection per case after
   * recording its execution.
   */
  async ingestJUnit(
    tenantId: string,
    planId: string,
    xml: string,
    cicdRunId?: string,
    browser = 'unspecified',
    os = 'unspecified',
  ) {
    const results = parseJUnitXml(xml);
    const recorded = [];

    for (const result of results) {
      const testCaseId = await withTenant(tenantId, async (client) => {
        const existing = await client.query(
          `select id from test_cases where plan_id = $1 and title = $2`,
          [planId, result.name],
        );
        if (existing.rows[0]) return existing.rows[0].id;

        const created = await client.query(
          `insert into test_cases (tenant_id, plan_id, title) values ($1, $2, $3) returning id`,
          [tenantId, planId, result.name],
        );
        return created.rows[0].id;
      });

      await withTenant(tenantId, (client) =>
        client.query(
          `insert into test_executions (tenant_id, test_case_id, cicd_run_id, status, duration_ms, error_message, browser, os)
           values ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [tenantId, testCaseId, cicdRunId ?? null, result.status, result.durationMs, result.errorMessage ?? null, browser, os],
        ),
      );

      await this.detectFlaky(tenantId, testCaseId);
      recorded.push({ testCaseId, ...result });
    }

    return { ingested: recorded.length, results: recorded };
  }

  /**
   * Cross-browser test matrix: for every (test case × browser/OS
   * combination) that has ever been executed, reports that combination's
   * MOST RECENT status — 'passed' | 'failed' | 'untested' is implicit by
   * a combination's simple absence from the matrix (a case never run
   * under a given browser/OS has no cell at all, not a fabricated
   * 'untested' row, since the space of possible browser/OS pairs is
   * unbounded and this platform doesn't own that catalog).
   */
  async browserMatrix(tenantId: string, planId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select distinct on (tc.id, te.browser, te.os)
           tc.id as test_case_id, tc.title, te.browser, te.os, te.status, te.executed_at
         from test_cases tc
         join test_executions te on te.test_case_id = tc.id
         where tc.plan_id = $1
         order by tc.id, te.browser, te.os, te.executed_at desc`,
        [planId],
      );

      const browsers = Array.from(new Set(rows.map((r) => r.browser))).sort();
      const cases = new Map<string, { testCaseId: string; title: string; results: Record<string, string> }>();
      for (const row of rows) {
        const cell = cases.get(row.test_case_id) ?? {
          testCaseId: row.test_case_id,
          title: row.title,
          results: {} as Record<string, string>,
        };
        cell.results[`${row.browser}/${row.os}`] = row.status;
        cases.set(row.test_case_id, cell);
      }

      return { browsers, cases: Array.from(cases.values()) };
    });
  }

  /**
   * Quarantine heuristic: if a test's last N executions contain BOTH a pass
   * and a fail, it's flagged flaky and quarantined — the "AI algorithm"
   * language in the original spec is doing a lot of work for what is, at
   * this data volume, a straightforward statistical rule; swap in an actual
   * model once there's enough execution history per test for one to beat
   * this baseline.
   */
  private async detectFlaky(tenantId: string, testCaseId: string) {
    const recent = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select status from test_executions where test_case_id = $1 order by executed_at desc limit $2`,
        [testCaseId, FLAKY_DETECTION_WINDOW],
      );
      return rows;
    });

    const passCount = recent.filter((r) => r.status === 'passed').length;
    const failCount = recent.filter((r) => r.status === 'failed').length;
    const isFlaky = passCount > 0 && failCount > 0;

    if (isFlaky) {
      await withTenant(tenantId, (client) =>
        client.query(
          `insert into flaky_test_flags (test_case_id, tenant_id, recent_pass_count, recent_fail_count, quarantined)
           values ($1, $2, $3, $4, true)
           on conflict (test_case_id) do update
             set recent_pass_count = excluded.recent_pass_count, recent_fail_count = excluded.recent_fail_count,
                 flagged_at = now(), quarantined = true`,
          [testCaseId, tenantId, passCount, failCount],
        ),
      );
    }
  }

  async listQuarantined(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select f.*, t.title from flaky_test_flags f
         join test_cases t on t.id = f.test_case_id
         where f.tenant_id = $1 and f.quarantined = true`,
        [tenantId],
      );
      return rows;
    });
  }

  /** A quarantined test that's since stabilized can be manually
   *  un-quarantined — deliberately not automatic, since "stopped flaking"
   *  and "stopped running" look identical from execution history alone. */
  async unquarantine(tenantId: string, testCaseId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update flaky_test_flags set quarantined = false where test_case_id = $1 returning *`,
        [testCaseId],
      );
      return rows[0] ?? null;
    });
  }
}
