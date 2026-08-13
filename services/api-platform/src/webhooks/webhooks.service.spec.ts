import { computeWebhookSignature } from './webhooks.service';

describe('computeWebhookSignature', () => {
  it('is deterministic — same secret hash and body always produce the same signature', () => {
    const s1 = computeWebhookSignature('secrethash123', '{"a":1}');
    const s2 = computeWebhookSignature('secrethash123', '{"a":1}');
    expect(s1).toBe(s2);
  });

  it('produces a 64-char lowercase hex sha256 HMAC digest', () => {
    const sig = computeWebhookSignature('secrethash123', '{"a":1}');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  it('changes when the body changes (tamper-evidence — a subscriber must be able to detect a modified payload)', () => {
    const original = computeWebhookSignature('secrethash123', '{"a":1}');
    const tampered = computeWebhookSignature('secrethash123', '{"a":2}');
    expect(tampered).not.toBe(original);
  });

  it('changes when the secret changes, even for the same body', () => {
    const sigA = computeWebhookSignature('secretA', '{"a":1}');
    const sigB = computeWebhookSignature('secretB', '{"a":1}');
    expect(sigA).not.toBe(sigB);
  });
});
