import { backoffMinutesFor } from './users.service';

describe('backoffMinutesFor', () => {
  it('returns 1 minute for a first-time lockout (lockout_count = 0)', () => {
    expect(backoffMinutesFor(0)).toBe(1);
  });

  it('grows across successive lockout episodes', () => {
    expect(backoffMinutesFor(1)).toBe(5);
    expect(backoffMinutesFor(2)).toBe(15);
    expect(backoffMinutesFor(3)).toBe(30);
    expect(backoffMinutesFor(4)).toBe(60);
  });

  it('caps at the longest configured backoff for a sustained attack, never growing unboundedly', () => {
    expect(backoffMinutesFor(5)).toBe(60);
    expect(backoffMinutesFor(100)).toBe(60);
    expect(backoffMinutesFor(Number.MAX_SAFE_INTEGER)).toBe(60);
  });

  it('is monotonically non-decreasing across the whole domain', () => {
    let prev = 0;
    for (let i = 0; i <= 20; i++) {
      const minutes = backoffMinutesFor(i);
      expect(minutes).toBeGreaterThanOrEqual(prev);
      prev = minutes;
    }
  });
});
