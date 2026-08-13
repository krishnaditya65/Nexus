-- artifacts service — a real npm-registry-protocol-compatible package
-- feed (docs/FEATURES.md §4/§10 "Artifacts/package registry"). Tarball
-- bytes live on local disk under ARTIFACTS_ROOT, same "local-disk today,
-- object-storage upload is the documented swap-in" pattern already used
-- by services/data-warehouse-sync and services/compliance's tenant data
-- export — Postgres holds metadata only, never large blobs.

create extension if not exists "pgcrypto";

create table if not exists packages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table packages enable row level security;
alter table packages force row level security;
create policy tenant_isolation_packages on packages
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists package_versions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  package_id uuid not null references packages(id) on delete cascade,
  version text not null,
  manifest jsonb not null,       -- the package.json this version was published with
  tarball_path text not null,    -- relative path under ARTIFACTS_ROOT
  tarball_filename text not null,-- e.g. "my-pkg-1.0.0.tgz" — the "-/  {filename}" npm asks for
  shasum text not null,
  size_bytes int not null,
  published_by_user_id uuid not null,
  published_at timestamptz not null default now(),
  unique (package_id, version)
);

alter table package_versions enable row level security;
alter table package_versions force row level security;
create policy tenant_isolation_package_versions on package_versions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_package_versions_package on package_versions (package_id, published_at);

-- dist-tags (npm's "latest", "beta", etc.) — one row per (package, tag),
-- upserted on every publish/tag update, same "current state, not an
-- event log" shape as git-host's branch_protection_rules.
create table if not exists package_dist_tags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  package_id uuid not null references packages(id) on delete cascade,
  tag text not null,
  version text not null,
  unique (package_id, tag)
);

alter table package_dist_tags enable row level security;
alter table package_dist_tags force row level security;
create policy tenant_isolation_package_dist_tags on package_dist_tags
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
