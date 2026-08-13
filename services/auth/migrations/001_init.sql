-- Nexus — Auth service schema
-- Multi-tenancy: tenant_id + RLS on every tenant-scoped table.

create extension if not exists "pgcrypto";
-- Must come before any table that types a column `citext` below — the type
-- doesn't exist until the extension creating it has run. Caught live by
-- Track 0 infra verification (docs/ROADMAP.md): this file previously
-- created `users.email citext` first and only added the extension after,
-- which passed every prior compile-only check but fails the instant it
-- runs against real Postgres.
create extension if not exists citext;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email citext not null,
  password_hash text not null,
  display_name text not null,
  role text not null default 'member', -- 'owner' | 'admin' | 'member' — deep RBAC layered on top later
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table users enable row level security;
-- Postgres exempts a table's OWNING role from RLS unless forced — and our
-- app connection is that owner (no separate low-privilege role yet, tracked
-- in docs/FEATURES.md under Advanced Access Policies). FORCE closes that gap
-- so isolation holds even without a role split.
alter table users force row level security;

create policy tenant_isolation_users on users
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Immutable audit log — append-only, no update/delete policy defined (nothing can mutate rows).
create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  actor_user_id uuid references users(id),
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);

alter table audit_log enable row level security;
alter table audit_log force row level security;

create policy tenant_isolation_audit_log on audit_log
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_audit_log_tenant_created on audit_log (tenant_id, created_at desc);

-- Runtime app role (eos_app) — least privilege, RLS-enforced via `force`
-- above. Applies to this migration's tables now and any future ones in this
-- service's database, so later migrations don't need to repeat this block.
grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
