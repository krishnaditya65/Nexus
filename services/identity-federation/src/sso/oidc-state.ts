/**
 * Pure expiry check extracted out of `OidcLoginService` (docs/
 * FEATURES.md — test-coverage fast-follow). `pendingLoginStates` never
 * checked its own `createdAt` before this — a login state that was
 * generated but never completed (browser closed mid-redirect, IdP
 * error) sat usable in memory FOREVER, since `completeLogin` only ever
 * deleted a state after successfully using it. A real bug, caught while
 * extracting this for testability, not by live testing (no Docker this
 * pass): an attacker who somehow obtained an old, abandoned `state`
 * value (e.g. from a referrer header or browser history on a shared
 * machine) could replay it indefinitely. `DEFAULT_TTL_MS` (10 minutes)
 * matches typical IdP authorization-code lifetimes.
 */
export const DEFAULT_OIDC_LOGIN_STATE_TTL_MS = 10 * 60 * 1000;

export function isOidcLoginStateExpired(
  createdAtMs: number,
  nowMs: number,
  ttlMs: number = DEFAULT_OIDC_LOGIN_STATE_TTL_MS,
): boolean {
  return nowMs - createdAtMs > ttlMs;
}
