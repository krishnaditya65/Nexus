import { isCountryAllowed, isImpossibleTravel } from './geoip.service';

describe('isCountryAllowed', () => {
  it('unrestricted (null allowlist) allows any country', () => {
    expect(isCountryAllowed('US', null)).toBe(true);
    expect(isCountryAllowed('US', undefined)).toBe(true);
    expect(isCountryAllowed('US', [])).toBe(true);
  });

  it('fails open on an unresolvable country', () => {
    expect(isCountryAllowed(null, ['US'])).toBe(true);
  });

  it('allows a listed country', () => {
    expect(isCountryAllowed('US', ['US', 'GB'])).toBe(true);
  });

  it('blocks an unlisted country', () => {
    expect(isCountryAllowed('RU', ['US', 'GB'])).toBe(false);
  });
});

describe('isImpossibleTravel', () => {
  const now = new Date('2026-08-13T12:00:00Z');

  it('never flags a first-ever login (no previous country)', () => {
    expect(isImpossibleTravel({ country: null, at: null }, { country: 'US', at: now })).toBe(false);
  });

  it('never flags the same country', () => {
    const prev = { country: 'US', at: new Date(now.getTime() - 5 * 60_000) };
    expect(isImpossibleTravel(prev, { country: 'US', at: now })).toBe(false);
  });

  it('flags a different country within the threshold window', () => {
    const prev = { country: 'US', at: new Date(now.getTime() - 30 * 60_000) }; // 30 min ago
    expect(isImpossibleTravel(prev, { country: 'AU', at: now }, 120)).toBe(true);
  });

  it('does not flag a different country outside the threshold window', () => {
    const prev = { country: 'US', at: new Date(now.getTime() - 5 * 60 * 60_000) }; // 5 hours ago
    expect(isImpossibleTravel(prev, { country: 'AU', at: now }, 120)).toBe(false);
  });

  it('does not flag a negative elapsed time (clock skew/out-of-order events)', () => {
    const prev = { country: 'US', at: new Date(now.getTime() + 60_000) }; // "after" current — malformed input
    expect(isImpossibleTravel(prev, { country: 'AU', at: now }, 120)).toBe(false);
  });
});
