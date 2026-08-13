import { resolveMasterKey, encryptSecret, decryptSecret, constantTimeEquals } from './envelope';

const TEST_KEY_HEX = 'a'.repeat(64);

describe('resolveMasterKey', () => {
  it('falls back to the fixed dev-only key when unset, without throwing', () => {
    const key = resolveMasterKey(undefined);
    expect(key.length).toBe(32);
  });

  it('accepts a valid 64-char hex string', () => {
    const key = resolveMasterKey(TEST_KEY_HEX);
    expect(key.length).toBe(32);
    expect(key.toString('hex')).toBe(TEST_KEY_HEX);
  });

  it('rejects a malformed key', () => {
    expect(() => resolveMasterKey('not-hex')).toThrow();
    expect(() => resolveMasterKey('abcd')).toThrow(); // too short
  });
});

describe('encryptSecret / decryptSecret', () => {
  const key = resolveMasterKey(TEST_KEY_HEX);

  it('round-trips a plaintext value', () => {
    const bundle = encryptSecret('client-secret-value', key);
    expect(decryptSecret(bundle, key)).toBe('client-secret-value');
  });

  it('produces a different bundle each call (random IV)', () => {
    const a = encryptSecret('same-value', key);
    const b = encryptSecret('same-value', key);
    expect(a).not.toBe(b);
    expect(decryptSecret(a, key)).toBe('same-value');
    expect(decryptSecret(b, key)).toBe('same-value');
  });

  it('fails to decrypt with the wrong key', () => {
    const bundle = encryptSecret('secret', key);
    const wrongKey = resolveMasterKey('b'.repeat(64));
    expect(() => decryptSecret(bundle, wrongKey)).toThrow();
  });

  it('fails to decrypt a tampered bundle (GCM auth tag catches it)', () => {
    const bundle = encryptSecret('secret', key);
    const [iv, tag, ciphertext] = bundle.split('.');
    const tampered = [iv, tag, Buffer.from('tampered-garbage').toString('base64')].join('.');
    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('rejects a malformed bundle shape', () => {
    expect(() => decryptSecret('not-a-valid-bundle', key)).toThrow();
  });
});

describe('constantTimeEquals', () => {
  it('returns true for equal strings', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
  });

  it('returns false for different strings', () => {
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
  });

  it('returns false for different-length strings', () => {
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });
});
