import { seatLineItem, overageLineItem } from './invoicing.service';

describe('seatLineItem', () => {
  it('multiplies seat price by seat count', () => {
    expect(seatLineItem('Team', 1000, 5).amountCents).toBe(5000);
  });

  it('includes the plan name and seat count in the description', () => {
    expect(seatLineItem('Enterprise', 2500, 12).description).toBe('Enterprise plan — 12 seat(s)');
  });

  it('produces a zero-cent line item for zero seats rather than throwing', () => {
    expect(seatLineItem('Free', 0, 0).amountCents).toBe(0);
  });
});

describe('overageLineItem', () => {
  it('rounds fractional cent totals to the nearest cent', () => {
    // 3 units at 2.5¢/unit = 7.5, rounds to 8
    expect(overageLineItem('ci_minutes', 2.5, 3).amountCents).toBe(8);
  });

  it('computes a whole-number result exactly with integer rates', () => {
    expect(overageLineItem('storage_gb', 10, 50).amountCents).toBe(500);
  });

  it('includes the metric name, unit count, and rate in the description', () => {
    expect(overageLineItem('ci_minutes', 2, 100).description).toBe('ci_minutes usage (100 units @ 2¢)');
  });

  it('returns zero for zero units', () => {
    expect(overageLineItem('storage_gb', 10, 0).amountCents).toBe(0);
  });
});
