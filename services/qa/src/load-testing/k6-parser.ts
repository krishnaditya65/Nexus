export interface K6Summary {
  vus?: number;
  iterations?: number;
  httpReqCount?: number;
  httpReqFailedRate?: number;
  avgDurationMs?: number;
  p95DurationMs?: number;
  p99DurationMs?: number;
}

/**
 * Parses k6's `--summary-export` JSON (also what `k6 run` prints as its
 * end-of-run summary, serialized) — the de facto standard load-testing
 * tool's report format, same "ingest what the real tool actually emits"
 * discipline junit-parser.ts already established for JUnit XML. Every
 * field is read defensively (k6's summary shape varies slightly across
 * versions and which metrics were actually recorded during the run) —
 * a summary missing `http_req_duration` percentiles, say, just yields
 * `undefined` on that field rather than throwing.
 */
export function parseK6Summary(json: string): K6Summary {
  const doc = JSON.parse(json);
  const metrics = doc.metrics ?? {};

  const duration = metrics.http_req_duration?.values ?? {};
  const failed = metrics.http_req_failed?.values ?? {};
  const reqs = metrics.http_reqs?.values ?? {};
  const vus = metrics.vus?.values ?? metrics.vus_max?.values ?? {};
  const iterations = metrics.iterations?.values ?? {};

  return {
    vus: numOrUndefined(vus.value ?? vus.max),
    iterations: numOrUndefined(iterations.count),
    httpReqCount: numOrUndefined(reqs.count),
    httpReqFailedRate: numOrUndefined(failed.rate),
    avgDurationMs: numOrUndefined(duration.avg),
    p95DurationMs: numOrUndefined(duration['p(95)']),
    p99DurationMs: numOrUndefined(duration['p(99)']),
  };
}

function numOrUndefined(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
