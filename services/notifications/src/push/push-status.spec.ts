import { decidePushDeliveryStatus } from './push-status';

describe('decidePushDeliveryStatus', () => {
  it('returns no_subscription when the user has zero push subscriptions', () => {
    expect(decidePushDeliveryStatus(0, false)).toBe('no_subscription');
  });

  it('returns no_subscription for zero subscriptions even if anyFailed is somehow true', () => {
    // Can't actually happen in practice (nothing to fail), but the
    // subscription-count check should still win — a send that was never
    // attempted is never "failed".
    expect(decidePushDeliveryStatus(0, true)).toBe('no_subscription');
  });

  it('returns sent when there are subscriptions and none failed', () => {
    expect(decidePushDeliveryStatus(1, false)).toBe('sent');
    expect(decidePushDeliveryStatus(3, false)).toBe('sent');
  });

  it('returns failed when there are subscriptions and at least one failed', () => {
    expect(decidePushDeliveryStatus(1, true)).toBe('failed');
    expect(decidePushDeliveryStatus(5, true)).toBe('failed');
  });
});
