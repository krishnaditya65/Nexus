-- §11.10 "Data retention & purge policies enforced in code" — until now
-- backup_policies.retention_days was configuration nobody read; nothing
-- ever deleted anything against it. This adds a real, queryable record of
-- enforcement runs, same "an untested backup isn't a real recovery
-- guarantee" reasoning last_verified_restore_at already applies to
-- restores — an unenforced retention policy isn't a real retention
-- guarantee either.

create table if not exists retention_purge_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  data_class text not null,
  retention_days int not null,
  deleted_count int not null,
  ran_at timestamptz not null default now()
);

alter table retention_purge_runs enable row level security;
alter table retention_purge_runs force row level security;
create policy tenant_isolation_retention_purge_runs on retention_purge_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table backup_policies add column if not exists last_purge_at timestamptz;

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
