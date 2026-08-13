/**
 * Pure decision/formatting logic extracted out of `ExportsService`
 * (docs/FEATURES.md — test-coverage fast-follow: this service had no
 * jest config at all until this pass). Kept separate from the
 * fs-writing/DB-querying service methods so it can be unit-tested with
 * no filesystem and no DB — same pure-function-for-testability
 * discipline as every other non-trivial decision in this build.
 */

/**
 * Only `s3_parquet` (actually a local-disk JSON stand-in, see
 * `ExportsService.writeToDestination`'s docblock) is actually
 * implemented — `snowflake`/`bigquery` are real, documented extension
 * points, not faked connections. Named as "unsupported" (not "invalid")
 * because all three are legitimate, validated `destinationType` values;
 * this is a capability gap, not a data-validation failure.
 */
export function isUnsupportedWarehouseConnector(destinationType: string): boolean {
  return destinationType === 'snowflake' || destinationType === 'bigquery';
}

/** Deterministic filename for a tenant's export run — pulled out so the
 *  `Date.now()` call happens once, at the actual call site, and this
 *  function itself stays pure and testable with an injected timestamp. */
export function buildExportFileName(tenantId: string, nowMs: number): string {
  return `${tenantId}-tickets-${nowMs}.json`;
}
