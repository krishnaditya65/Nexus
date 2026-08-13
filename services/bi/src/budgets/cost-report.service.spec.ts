import { isCapexTicketType, costCentsFor } from './cost-report.service';

describe('isCapexTicketType', () => {
  it('classifies feature and epic tickets as CapEx', () => {
    expect(isCapexTicketType('feature')).toBe(true);
    expect(isCapexTicketType('epic')).toBe(true);
  });

  it('classifies bugs, chores, and everything else as OpEx', () => {
    expect(isCapexTicketType('bug')).toBe(false);
    expect(isCapexTicketType('chore')).toBe(false);
    expect(isCapexTicketType('spike')).toBe(false);
  });

  it('treats an unlinked entry (no ticket type at all) as OpEx, not a crash', () => {
    expect(isCapexTicketType(undefined)).toBe(false);
  });
});

describe('costCentsFor', () => {
  it('computes an hourly rate applied to a fraction of an hour', () => {
    // 30 minutes at $100/hr (10000 cents/hr) = $50 = 5000 cents
    expect(costCentsFor(30, 10000)).toBe(5000);
  });

  it('computes a full hour correctly', () => {
    expect(costCentsFor(60, 10000)).toBe(10000);
  });

  it('rounds to the nearest cent rather than truncating or accumulating drift', () => {
    // 1 minute at $100/hr = 166.66...cents -> rounds to 167
    expect(costCentsFor(1, 10000)).toBe(167);
  });

  it('returns 0 for 0 minutes logged', () => {
    expect(costCentsFor(0, 10000)).toBe(0);
  });

  // Live-verified end-to-end this session: $100/hr x 3h feature ticket = $300
  // (30000 cents) exactly, matching FEATURES.md §11.7's recorded result.
  it('matches the real live-verified $100/hr x 3h = $300 case', () => {
    expect(costCentsFor(180, 10000)).toBe(30000);
  });
});
