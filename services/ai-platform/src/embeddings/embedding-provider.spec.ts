import { hashFallbackEmbedding } from './embedding-provider';

describe('hashFallbackEmbedding', () => {
  it('is deterministic — the same text always produces the same vector', () => {
    const v1 = hashFallbackEmbedding('hello world');
    const v2 = hashFallbackEmbedding('hello world');
    expect(v1).toEqual(v2);
  });

  it('returns a 1536-dimensional vector, matching real embedding dimensions', () => {
    expect(hashFallbackEmbedding('anything').length).toBe(1536);
  });

  it('returns an L2-normalized vector (magnitude ~1)', () => {
    const v = hashFallbackEmbedding('some reasonably long piece of text to embed');
    const magnitude = Math.sqrt(v.reduce((sum, x) => sum + x * x, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it('is not identically zero for real text (a degenerate all-zero vector would break cosine similarity everywhere)', () => {
    const v = hashFallbackEmbedding('some text');
    expect(v.some((x) => x !== 0)).toBe(true);
  });

  it('produces distinct vectors for clearly unrelated text', () => {
    const v1 = hashFallbackEmbedding('zebra migration runbook database cluster');
    const v2 = hashFallbackEmbedding('completely different topic about cooking recipes');
    expect(v1).not.toEqual(v2);
  });

  it('produces closer vectors (higher cosine similarity) for near-duplicate text than for unrelated text', () => {
    const cosine = (a: number[], b: number[]) => a.reduce((sum, x, i) => sum + x * b[i], 0);

    const base = hashFallbackEmbedding('the zebra migration runbook needs review');
    const nearDup = hashFallbackEmbedding('the zebra migration runbook needs a review');
    const unrelated = hashFallbackEmbedding('completely unrelated cooking recipe content here');

    expect(cosine(base, nearDup)).toBeGreaterThan(cosine(base, unrelated));
  });

  it('handles empty text without throwing (returns a zero vector, not NaN)', () => {
    const v = hashFallbackEmbedding('');
    expect(v.every((x) => Number.isFinite(x))).toBe(true);
  });
});
