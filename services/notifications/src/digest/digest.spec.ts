import { isValidDigestFrequency, shouldSendDigest, buildDigestEmail, DigestDelivery } from './digest';

const deliveries: DigestDelivery[] = [
  { title: 'You were mentioned', body: 'in #general', category: 'mention', createdAt: '2026-08-14T00:00:00Z' },
  { title: 'Automation fired', body: 'moved to Done', category: 'automation', createdAt: '2026-08-14T01:00:00Z' },
];

describe('isValidDigestFrequency', () => {
  it('accepts off/daily/weekly', () => {
    expect(isValidDigestFrequency('off')).toBe(true);
    expect(isValidDigestFrequency('daily')).toBe(true);
    expect(isValidDigestFrequency('weekly')).toBe(true);
  });

  it('rejects anything else', () => {
    expect(isValidDigestFrequency('hourly')).toBe(false);
  });
});

describe('shouldSendDigest', () => {
  it('is false for zero deliveries', () => {
    expect(shouldSendDigest([])).toBe(false);
  });

  it('is true for one or more deliveries', () => {
    expect(shouldSendDigest(deliveries)).toBe(true);
  });
});

describe('buildDigestEmail', () => {
  it('includes the delivery count and frequency in the subject', () => {
    const { subject } = buildDigestEmail('daily', deliveries);
    expect(subject).toBe('Your daily digest: 2 updates');
  });

  it('uses singular "update" for exactly one delivery', () => {
    const { subject } = buildDigestEmail('weekly', [deliveries[0]]);
    expect(subject).toBe('Your weekly digest: 1 update');
  });

  it('includes every delivery, with its category, in the body', () => {
    const { body } = buildDigestEmail('daily', deliveries);
    expect(body).toContain('[mention] You were mentioned — in #general');
    expect(body).toContain('[automation] Automation fired — moved to Done');
  });
});
