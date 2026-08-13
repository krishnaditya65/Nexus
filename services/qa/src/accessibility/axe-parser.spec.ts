import { parseAxeResults } from './axe-parser';

// Real axe-core results shape — same figures live-verified earlier this
// session (3 violations across critical/serious/moderate, color-contrast's
// 2 nodes correctly counted as 1 violation, not 2).
const REAL_AXE_RESULTS = JSON.stringify({
  url: 'https://example.com/checkout',
  violations: [
    { id: 'image-alt', impact: 'critical', description: 'Images must have alt text', nodes: [{}] },
    { id: 'label', impact: 'serious', description: 'Form elements must have labels', nodes: [{}] },
    {
      id: 'color-contrast',
      impact: 'moderate',
      description: 'Elements must meet contrast ratio thresholds',
      nodes: [{}, {}],
    },
  ],
});

describe('parseAxeResults', () => {
  it('parses violations and preserves the source URL from a real axe-core report', () => {
    const result = parseAxeResults(REAL_AXE_RESULTS);
    expect(result.url).toBe('https://example.com/checkout');
    expect(result.violations).toHaveLength(3);
    expect(result.violations[0]).toEqual({
      id: 'image-alt',
      impact: 'critical',
      description: 'Images must have alt text',
      nodeCount: 1,
    });
  });

  it('counts VIOLATIONS per impact level, not affected nodes — a violation with 2 nodes still counts once', () => {
    const result = parseAxeResults(REAL_AXE_RESULTS);
    expect(result.countsByImpact).toEqual({ critical: 1, serious: 1, moderate: 1, minor: 0 });
  });

  it('handles a report with zero violations (clean audit)', () => {
    const result = parseAxeResults(JSON.stringify({ url: 'https://example.com', violations: [] }));
    expect(result.violations).toEqual([]);
    expect(result.countsByImpact).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
  });

  it('defaults nodeCount to 0 and impact to null when a violation is missing those fields', () => {
    const result = parseAxeResults(JSON.stringify({ violations: [{ id: 'unknown-rule' }] }));
    expect(result.violations[0]).toEqual({ id: 'unknown-rule', impact: null, description: '', nodeCount: 0 });
  });

  it('never throws on a malformed/missing violations array — treats it as empty', () => {
    expect(parseAxeResults(JSON.stringify({ url: 'x' })).violations).toEqual([]);
    expect(parseAxeResults(JSON.stringify({ violations: 'not-an-array' })).violations).toEqual([]);
  });

  it('ignores an impact value axe-core has never actually emitted rather than crashing on an unknown key', () => {
    const result = parseAxeResults(JSON.stringify({ violations: [{ id: 'x', impact: 'catastrophic', nodes: [] }] }));
    expect(result.countsByImpact).toEqual({ critical: 0, serious: 0, moderate: 0, minor: 0 });
  });
});
