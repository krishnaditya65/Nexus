/**
 * Pluggable embedding provider — calls a real embeddings API
 * (OpenAI-compatible `/embeddings` endpoint: OpenAI itself, or Voyage AI,
 * Anthropic's recommended embeddings partner, both speak this shape)
 * configured via env vars. No API key configured falls back to a
 * deterministic hash-based pseudo-embedding — clearly NOT semantically
 * meaningful, only useful so `npm run start:dev` and integration tests
 * work end-to-end without a real API key. Never ships pretending the
 * fallback is real semantic search; callers can check `usedFallback`.
 */

const EMBEDDING_DIMENSIONS = 1536;

export interface EmbeddingResult {
  vector: number[];
  usedFallback: boolean;
}

export async function embedText(text: string): Promise<EmbeddingResult> {
  const apiUrl = process.env.EMBEDDING_API_URL;
  const apiKey = process.env.EMBEDDING_API_KEY;
  const model = process.env.EMBEDDING_MODEL ?? 'text-embedding-3-small';

  if (!apiUrl || !apiKey) {
    return { vector: hashFallbackEmbedding(text), usedFallback: true };
  }

  const res = await fetch(apiUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input: text }),
  });
  if (!res.ok) {
    throw new Error(`embedding API call failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as { data: Array<{ embedding: number[] }> };
  return { vector: body.data[0].embedding, usedFallback: false };
}

/**
 * Deterministic, dependency-free pseudo-embedding: hashes overlapping
 * trigrams of the input into a fixed-size vector, then L2-normalizes it.
 * Two inputs sharing more trigrams land closer together under cosine
 * similarity than two unrelated strings — enough to exercise the pgvector
 * plumbing end-to-end — but this is NOT a language model and captures none
 * of the actual semantics real embeddings would. Development/test only.
 */
export function hashFallbackEmbedding(text: string): number[] {
  const vector = new Array(EMBEDDING_DIMENSIONS).fill(0);
  const normalized = text.toLowerCase().replace(/\s+/g, ' ').trim();
  for (let i = 0; i < normalized.length - 2; i++) {
    const trigram = normalized.slice(i, i + 3);
    let hash = 0;
    for (let j = 0; j < trigram.length; j++) {
      hash = (hash * 31 + trigram.charCodeAt(j)) >>> 0;
    }
    vector[hash % EMBEDDING_DIMENSIONS] += 1;
  }
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vector.map((v) => v / magnitude);
}
