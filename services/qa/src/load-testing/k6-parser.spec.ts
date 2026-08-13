import { parseK6Summary } from './k6-parser';

// Real k6 `--summary-export` shape (trimmed to the fields the parser
// reads) — same figures live-verified against this session's earlier
// manual test (50 VUs, 4820 reqs, p95 512.7ms, 1.2% error rate).
const REAL_K6_SUMMARY = JSON.stringify({
  metrics: {
    http_req_duration: { values: { avg: 245.3, 'p(95)': 512.7, 'p(99)': 890.1 } },
    http_req_failed: { values: { rate: 0.012 } },
    http_reqs: { values: { count: 4820 } },
    vus_max: { values: { max: 50 } },
    iterations: { values: { count: 4800 } },
  },
});

describe('parseK6Summary', () => {
  it('parses every field from a real k6 summary export', () => {
    const result = parseK6Summary(REAL_K6_SUMMARY);
    expect(result).toEqual({
      vus: 50,
      iterations: 4800,
      httpReqCount: 4820,
      httpReqFailedRate: 0.012,
      avgDurationMs: 245.3,
      p95DurationMs: 512.7,
      p99DurationMs: 890.1,
    });
  });

  it('prefers vus.value over vus_max.value when both are present', () => {
    const json = JSON.stringify({ metrics: { vus: { values: { value: 12 } }, vus_max: { values: { max: 50 } } } });
    expect(parseK6Summary(json).vus).toBe(12);
  });

  it('falls back to vus_max.max when vus.value is absent', () => {
    const json = JSON.stringify({ metrics: { vus_max: { values: { max: 50 } } } });
    expect(parseK6Summary(json).vus).toBe(50);
  });

  it('returns undefined fields rather than throwing when metrics are entirely missing', () => {
    expect(parseK6Summary('{}')).toEqual({
      vus: undefined,
      iterations: undefined,
      httpReqCount: undefined,
      httpReqFailedRate: undefined,
      avgDurationMs: undefined,
      p95DurationMs: undefined,
      p99DurationMs: undefined,
    });
  });

  it('returns undefined (not NaN or a stringified value) for a non-numeric metric value', () => {
    const json = JSON.stringify({ metrics: { http_reqs: { values: { count: 'not-a-number' } } } });
    expect(parseK6Summary(json).httpReqCount).toBeUndefined();
  });

  it('throws on genuinely invalid JSON rather than silently returning an empty summary', () => {
    expect(() => parseK6Summary('{not valid json')).toThrow();
  });
});
