/**
 * Pure decision logic extracted out of `PushService.sendToUser` (docs/
 * FEATURES.md — test-coverage fast-follow: this service had no jest
 * config at all until this pass, see `jest.config.js`'s docblock).
 * Kept separate from the DB/webpush-calling service method itself so it
 * can be unit-tested with no DB and no real push send — same
 * pure-function-for-testability discipline as every other non-trivial
 * decision in this build (`filterRestrictedFields`, `nextColor`,
 * `decideHealthCheckOutcome`, etc.).
 */
export type PushDeliveryStatus = 'sent' | 'failed' | 'no_subscription';

/**
 * A user with zero subscriptions was never actually attempted —
 * `no_subscription`, distinct from a real attempt that failed. Any single
 * failed send marks the whole delivery `failed`, even if other devices
 * succeeded — matches `PushService.sendToUser`'s original behavior
 * (the loop overwrites `status = 'failed'` on the first failure and never
 * resets it back to `'sent'` for a later success).
 */
export function decidePushDeliveryStatus(subscriptionCount: number, anyFailed: boolean): PushDeliveryStatus {
  if (subscriptionCount === 0) return 'no_subscription';
  return anyFailed ? 'failed' : 'sent';
}
