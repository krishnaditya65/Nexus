-- Saved filters / JQL-like queries (docs/FEATURES.md §2, §10 "Queries").
-- Filters are stored as structured JSON, not a free-text query string —
-- see queries.service.ts's docblock for why: it makes injection
-- impossible by construction (every field/operator is checked against a
-- whitelist before being used to build SQL) rather than needing a real
-- parser to make a string-based query language safe.
create table if not exists saved_queries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  -- null project_id = a cross-project query (e.g. "everything assigned to
  -- me"); a project-scoped query only appears in that project's Queries list.
  project_id uuid references projects(id) on delete cascade,
  name text not null,
  filters jsonb not null default '[]',
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table saved_queries enable row level security;
alter table saved_queries force row level security;
create policy tenant_isolation_saved_queries on saved_queries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_saved_queries_project on saved_queries (project_id);
