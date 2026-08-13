-- Pipelines Library (docs/FEATURES.md §10 "Pipelines > Library") — reusable
-- config surfaces referenced by name from a pipeline's YAML definition:
-- variable groups (shared key/value sets, entries optionally marked secret
-- and never returned once set — same shown-once discipline as
-- api-platform's webhook secrets), secure files (named blobs materialized
-- into a run's workspace, metadata-only over the API — no download
-- endpoint, by design), and task groups (named reusable step sequences a
-- pipeline step can reference via `taskGroup: <name>` instead of inlining
-- `run`).

create table if not exists variable_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table variable_groups enable row level security;
alter table variable_groups force row level security;
create policy tenant_isolation_variable_groups on variable_groups
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists variable_group_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  group_id uuid not null references variable_groups(id) on delete cascade,
  key text not null,
  value text not null,
  is_secret boolean not null default false,
  created_at timestamptz not null default now(),
  unique (group_id, key)
);

alter table variable_group_entries enable row level security;
alter table variable_group_entries force row level security;
create policy tenant_isolation_variable_group_entries on variable_group_entries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists secure_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  content_base64 text not null,
  size_bytes int not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table secure_files enable row level security;
alter table secure_files force row level security;
create policy tenant_isolation_secure_files on secure_files
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists task_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  steps jsonb not null,  -- array of {name, run, image?} — same shape as a pipeline's inline steps
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table task_groups enable row level security;
alter table task_groups force row level security;
create policy tenant_isolation_task_groups on task_groups
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update, delete on variable_groups, variable_group_entries, secure_files, task_groups to eos_app;
