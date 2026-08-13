import { generateRawSecret, hashSecret, verifySecret, encodeToken, decodeToken } from './token.util';

describe('generateRawSecret', () => {
  it('generates a non-empty, URL-safe string', () => {
    const secret = generateRawSecret();
    expect(secret.length).toBeGreaterThan(0);
    expect(secret).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('generates distinct secrets on each call', () => {
    expect(generateRawSecret()).not.toBe(generateRawSecret());
  });
});

describe('hashSecret / verifySecret', () => {
  it('verifies a secret against its own hash', async () => {
    const raw = 'my-runner-secret-123';
    const hash = await hashSecret(raw);
    await expect(verifySecret(raw, hash)).resolves.toBe(true);
  });

  it('rejects the wrong secret', async () => {
    const hash = await hashSecret('correct-secret');
    await expect(verifySecret('wrong-secret', hash)).resolves.toBe(false);
  });

  it('salts each hash independently — hashing the same secret twice yields different output', async () => {
    const h1 = await hashSecret('same-secret');
    const h2 = await hashSecret('same-secret');
    expect(h1).not.toBe(h2);
    await expect(verifySecret('same-secret', h1)).resolves.toBe(true);
    await expect(verifySecret('same-secret', h2)).resolves.toBe(true);
  });

  it('rejects a malformed stored hash rather than throwing', async () => {
    await expect(verifySecret('anything', 'not-a-valid-hash-format')).resolves.toBe(false);
    await expect(verifySecret('anything', '')).resolves.toBe(false);
  });
});

describe('encodeToken / decodeToken', () => {
  const tenantId = '3ea0a7af-6c49-4780-8f5f-9278046e6018';
  const runnerId = '423604c9-80f5-4b0f-8122-32e948638d3e';

  it('round-trips tenantId/runnerId/rawSecret through encode then decode', () => {
    const token = encodeToken(tenantId, runnerId, 'raw-secret-value');
    expect(decodeToken(token)).toEqual({ tenantId, runnerId, rawSecret: 'raw-secret-value' });
  });

  it('rejects a token with the wrong number of segments', () => {
    expect(decodeToken('only.two')).toBeNull();
    expect(decodeToken('way.too.many.segments.here')).toBeNull();
  });

  it('rejects a token whose tenantId or runnerId is not a real UUID', () => {
    expect(decodeToken('not-a-uuid.' + runnerId + '.secret')).toBeNull();
    expect(decodeToken(tenantId + '.not-a-uuid.secret')).toBeNull();
  });

  it('rejects a token with an empty secret segment', () => {
    expect(decodeToken(`${tenantId}.${runnerId}.`)).toBeNull();
  });
});
