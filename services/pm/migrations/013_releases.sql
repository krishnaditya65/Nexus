-- Releases / Fix Versions (docs/FEATURES.md §11.2) — version tagging on
-- tickets, distinct from a sprint (a ticket ships in exactly one release
-- regardless of which sprint(s) it moved through to get there). Release
-- notes generation reads the tickets tagged to a release at export time
-- rather than storing denormalized notes text.

create table if not exists releases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  description text not null default '',
  release_date date,
  status text not null default 'unreleased', -- 'unreleased' | 'released' | 'archived'
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

alter table releases enable row level security;
alter table releases force row level security;
create policy tenant_isolation_releases on releases
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table tickets add column if not exists release_id uuid references releases(id) on delete set null;
create index if not exists idx_tickets_release on tickets (release_id) where release_id is not null;

grant select, insert, update, delete on releases to eos_app;
