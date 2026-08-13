-- §11.9 plugin/connector framework: a small marketplace of known connector
-- TYPES (a static catalog — real third-party integrations, not a generic
-- "run arbitrary code" plugin runtime, which is out of scope for this repo)
-- and per-tenant INSTALLS of those types with their own config/credentials
-- and sync history. First real connector implemented against this: GitHub
-- issue import (services/api-platform/src/connectors/github.connector.ts).

create table if not exists connector_types (
  id text primary key,             -- e.g. 'github'
  name text not null,
  description text not null,
  config_schema jsonb not null,    -- [{key, label, type, required}] — drives the install form
  capabilities text[] not null default '{}' -- e.g. '{import-issues}'
);

create table if not exists connector_installs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  connector_type_id text not null references connector_types(id),
  name text not null,
  config jsonb not null default '{}',   -- non-secret config (owner/repo, target project id)
  credential text,                       -- secret (e.g. PAT) — never returned by list()/get()
  status text not null default 'active', -- 'active' | 'disabled'
  last_synced_at timestamptz,
  last_sync_result jsonb,
  created_at timestamptz not null default now()
);

alter table connector_installs enable row level security;
alter table connector_installs force row level security;
create policy tenant_isolation_connector_installs on connector_installs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists connector_sync_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  install_id uuid not null references connector_installs(id) on delete cascade,
  status text not null,           -- 'success' | 'failed'
  items_imported int not null default 0,
  items_skipped int not null default 0,
  error text,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table connector_sync_runs enable row level security;
alter table connector_sync_runs force row level security;
create policy tenant_isolation_connector_sync_runs on connector_sync_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Static marketplace catalog — seeded once, not tenant-scoped (same shape
-- as a real plugin marketplace listing).
insert into connector_types (id, name, description, config_schema, capabilities) values
  ('github', 'GitHub', 'Import issues from a public or private GitHub repository as tickets.',
   '[
     {"key":"owner","label":"Repository owner","type":"text","required":true},
     {"key":"repo","label":"Repository name","type":"text","required":true},
     {"key":"targetProjectId","label":"Target project ID","type":"text","required":true},
     {"key":"credential","label":"GitHub personal access token (optional, for private repos / higher rate limits)","type":"secret","required":false}
   ]'::jsonb,
   '{import-issues}')
on conflict (id) do nothing;

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
