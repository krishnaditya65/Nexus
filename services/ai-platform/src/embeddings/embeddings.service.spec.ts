import { toVectorLiteral } from './embeddings.service';

describe('toVectorLiteral', () => {
  it('formats a vector as pgvector literal syntax', () => {
    expect(toVectorLiteral([0.1, 0.2, 0.3])).toBe('[0.1,0.2,0.3]');
  });

  it('handles negative numbers and integers', () => {
    expect(toVectorLiteral([-1, 0, 1])).toBe('[-1,0,1]');
  });

  it('handles an empty vector', () => {
    expect(toVectorLiteral([])).toBe('[]');
  });

  it('handles a single-element vector without a stray comma', () => {
    expect(toVectorLiteral([0.5])).toBe('[0.5]');
  });
});
