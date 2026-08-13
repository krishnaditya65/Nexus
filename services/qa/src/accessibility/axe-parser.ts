export interface AxeViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  description: string;
  nodeCount: number;
}

export interface AxeAuditResult {
  url?: string;
  violations: AxeViolation[];
  countsByImpact: { critical: number; serious: number; moderate: number; minor: number };
}

/**
 * Parses axe-core's JSON output (the `results` object `axe.run()`
 * resolves with, or what `@axe-core/cli`/Playwright's axe integration
 * writes to disk) — the de facto standard accessibility-audit tool, same
 * "ingest the real tool's own report format" discipline as JUnit/k6
 * above. `countsByImpact` counts VIOLATIONS (not nodes-within-a-
 * violation) per impact level, since that's what a test-plan pass/fail
 * gate reasonably keys off — "1 critical violation across 40 elements"
 * is one thing to fix, not 40.
 */
export function parseAxeResults(json: string): AxeAuditResult {
  const doc = JSON.parse(json);
  const rawViolations = Array.isArray(doc.violations) ? doc.violations : [];

  const violations: AxeViolation[] = rawViolations.map((v: any) => ({
    id: v.id ?? 'unknown-rule',
    impact: v.impact ?? null,
    description: v.description ?? '',
    nodeCount: Array.isArray(v.nodes) ? v.nodes.length : 0,
  }));

  const countsByImpact = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  for (const v of violations) {
    if (v.impact && v.impact in countsByImpact) {
      countsByImpact[v.impact as keyof typeof countsByImpact] += 1;
    }
  }

  return { url: doc.url, violations, countsByImpact };
}
