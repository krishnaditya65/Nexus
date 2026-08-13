-- DR backup/restore automation (docs/FEATURES.md §11.1/§0) — the DR
-- policy registry (backup_policies, 001_init.sql) always tracked RPO/RTO
-- targets and `last_verified_restore_at` as DATA; nothing ever took a
-- real backup or actually attempted a restore against those targets.
-- This table is the real, queryable history of both.
create table if not exists backup_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  data_class text not null,
  storage_path text not null,   -- local-disk path this pass; same documented object-storage swap-in as artifacts/comms storage.ts
  row_count int not null,
  taken_at timestamptz not null default now()
);
alter table backup_runs enable row level security;
alter table backup_runs force row level security;
create policy tenant_isolation_backup_runs on backup_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists restore_verifications (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  backup_run_id uuid not null references backup_runs(id) on delete cascade,
  succeeded boolean not null,
  row_count_verified int not null,
  error text,
  verified_at timestamptz not null default now()
);
alter table restore_verifications enable row level security;
alter table restore_verifications force row level security;
create policy tenant_isolation_restore_verifications on restore_verifications
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Cross-tenant scheduling — same SECURITY DEFINER pattern as pm's
-- list_due_subscriptions()/list_enabled_siem_exports(): a scheduler tick
-- has to find every tenant with a 'tickets' backup policy at once, which
-- FORCE ROW LEVEL SECURITY makes a normal tenant-scoped connection
-- structurally unable to do.
create or replace function public.list_tenants_with_ticket_backup_policy()
returns table (tenant_id uuid, backup_frequency text)
language sql
security definer
set search_path = public
as $$
  select tenant_id, backup_frequency from backup_policies where data_class = 'tickets';
$$;

grant execute on function public.list_tenants_with_ticket_backup_policy() to eos_app;
grant select, insert, update, delete on backup_runs, restore_verifications to eos_app;
