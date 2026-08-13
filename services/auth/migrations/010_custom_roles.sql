-- Custom role builder (docs/FEATURES.md §11.1 / §13.8's "Configuration
-- Schemes"): arbitrary tenant-defined roles with a granular permission set,
-- layered ON TOP of the existing fixed owner/admin/member enum rather than
-- replacing it — see RolesService's docblock for why. A custom role grants
-- ADDITIONAL, narrow capabilities to a 'member'; it never restricts what an
-- 'owner'/'admin' can already do, so this migration changes zero existing
-- behavior for every tenant that never touches the feature.
create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  -- Validated against RolesService's PERMISSIONS catalog at the application
  -- layer, not a DB constraint (the catalog is expected to grow over time;
  -- a CHECK constraint would need a migration for every new permission).
  permissions text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table roles enable row level security;
alter table roles force row level security;
create policy tenant_isolation_roles on roles
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- A user may hold at most one custom role (kept simple deliberately — no
-- role composition/inheritance in this first build, same "narrower slice,
-- disclosed" discipline as every other §11/§12 item). Null means "no custom
-- role" — the ordinary owner/admin/member enum on `users.role` is
-- unaffected either way, and remains the ONLY thing checked by any service
-- that hasn't adopted the new PermissionsGuard.
alter table users add column if not exists custom_role_id uuid references roles(id) on delete set null;
