# ai-platform (Phase 1)

pgvector-backed embeddings, semantic search, and duplicate-ticket triage.

## What's real

- `POST /internal/embeddings/index` — internal endpoint any service pushes
  text to (`services/pm` calls this on every ticket create — see
  `tickets.service.ts`'s `indexForSearch`). Embeds via a pluggable provider
  (`src/embeddings/embedding-provider.ts`) and upserts into pgvector.
- `GET /search?q=...` — cosine-similarity search across every indexed
  source type via pgvector's `<=>` operator — the "code-to-chat semantic
  search" differentiator, minus code/chat indexing itself (only tickets are
  wired as producers so far).
- `POST /triage/find-duplicates` — embeds a candidate ticket's text,
  returns existing tickets above a 0.92 cosine-similarity threshold as
  duplicate candidates.

## Embedding provider — real API or honest fallback

Set `EMBEDDING_API_URL` + `EMBEDDING_API_KEY` (+ optionally
`EMBEDDING_MODEL`) to call a real OpenAI-compatible embeddings endpoint
(OpenAI itself, or Voyage AI). **Without those set**, every embed call uses
a deterministic hash-based pseudo-embedding — clearly documented as NOT
semantically meaningful, only present so the pgvector plumbing (index,
search, threshold-based dedup) is exercisable without a live API key.
Every response includes `usedFallbackEmbedding` so a caller can tell which
mode produced a given result.

## What's not (⚪)

- Meeting transcription → auto action-item tickets.
- Blast radius analysis pre-release.
- Git-blame-informed assignee suggestions (triage returns duplicate
  candidates only, not a suggested developer).
- Chat/wiki/code as embedding producers (only `services/pm` tickets call
  the internal index endpoint today).
