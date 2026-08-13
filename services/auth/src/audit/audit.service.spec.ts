import { computeEntryHash, GENESIS_HASH } from './audit.service';

const baseRow = {
  tenant_id: 't1',
  actor_user_id: 'u1',
  action: 'user.login',
  resource_type: 'user',
  resource_id: 'u1',
  metadata: { foo: 'bar' },
  created_at: '2026-08-12T00:00:00.000Z',
};

describe('computeEntryHash', () => {
  it('is deterministic — same inputs always produce the same hash', () => {
    const h1 = computeEntryHash(GENESIS_HASH, baseRow);
    const h2 = computeEntryHash(GENESIS_HASH, baseRow);
    expect(h1).toBe(h2);
  });

  it('produces a 64-char lowercase hex sha256 digest', () => {
    const hash = computeEntryHash(GENESIS_HASH, baseRow);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  // The whole point of the hash chain: an edit to ANY field after the fact
  // must change the hash, or tampering would go undetected. Each case below
  // flips exactly one field and asserts the hash moves.
  it.each([
    ['prevHash', () => computeEntryHash('a-different-prev-hash', baseRow)],
    ['action', () => computeEntryHash(GENESIS_HASH, { ...baseRow, action: 'user.logout' })],
    ['actor_user_id', () => computeEntryHash(GENESIS_HASH, { ...baseRow, actor_user_id: 'u2' })],
    ['resource_type', () => computeEntryHash(GENESIS_HASH, { ...baseRow, resource_type: 'tenant' })],
    ['resource_id', () => computeEntryHash(GENESIS_HASH, { ...baseRow, resource_id: 'u2' })],
    ['metadata', () => computeEntryHash(GENESIS_HASH, { ...baseRow, metadata: { foo: 'baz' } })],
    ['created_at', () => computeEntryHash(GENESIS_HASH, { ...baseRow, created_at: '2026-08-12T00:00:01.000Z' })],
  ])('changes when %s changes (tamper-detection sensitivity)', (_field, compute) => {
    const original = computeEntryHash(GENESIS_HASH, baseRow);
    expect(compute()).not.toBe(original);
  });

  it('treats a null actor_user_id and resource_id distinctly from real values (system-actor events)', () => {
    const withActor = computeEntryHash(GENESIS_HASH, baseRow);
    const systemActor = computeEntryHash(GENESIS_HASH, { ...baseRow, actor_user_id: null, resource_id: null });
    expect(systemActor).not.toBe(withActor);
  });

  it('chains correctly — the second entry\'s hash depends on the first entry\'s hash', () => {
    const first = computeEntryHash(GENESIS_HASH, baseRow);
    const secondRow = { ...baseRow, action: 'user.logout' };
    const secondLinkedToFirst = computeEntryHash(first, secondRow);
    const secondLinkedToGenesis = computeEntryHash(GENESIS_HASH, secondRow);
    // Same row content, different prevHash — must produce different hashes,
    // which is exactly what makes reordering/splicing detectable.
    expect(secondLinkedToFirst).not.toBe(secondLinkedToGenesis);
  });
});
