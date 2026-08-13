-- ai-platform service — vector embeddings + semantic search, feeding
-- code-to-chat unified search and AI auto-triage/dedup. Requires the
-- pgvector extension (see infra/docker/docker-compose.yml's postgres image).

create extension if not exists "pgcrypto";
create extension if not exists "vector";

-- 1536 dims matches OpenAI's text-embedding-3-small / Voyage AI's
-- voyage-3-lite — the two providers embedding-provider.ts supports. Change
-- this dimension if the configured EMBEDDING_MODEL uses a different size.
create table if not exists document_embeddings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_type text not null,   -- 'ticket' | 'wiki' | 'chat_message' | 'code'
  source_id text not null,     -- cross-service reference, not enforced here
  content_excerpt text not null, -- first ~500 chars, shown in search results without re-fetching the source
  embedding vector(1536) not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, source_type, source_id)
);

alter table document_embeddings enable row level security;
alter table document_embeddings force row level security;
create policy tenant_isolation_document_embeddings on document_embeddings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- ivfflat requires an existing row count estimate to pick `lists` well; 100
-- is a reasonable default for this stage and should be re-tuned (or moved
-- to HNSW, pgvector 0.5+) once real embedding volume exists.
create index if not exists idx_document_embeddings_cosine
  on document_embeddings using ivfflat (embedding vector_cosine_ops) with (lists = 100);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
