-- Scheduled JQL/filter subscriptions (docs/FEATURES.md §13.3) — the first
-- real consumer of this platform's first real scheduler infra. Before this,
-- `data-warehouse-sync.export_destinations.schedule_cron` and
-- `compliance`'s backup-policy enforcement were both cron-shaped COLUMNS
-- with nothing that ever reads them on a timer (see both services'
-- docblocks) — genuinely no cron/job-queue infra existed anywhere in this
-- repo. This migration + services/notifications's new scheduler/email
-- modules are that infra's first real, running instance; the other two
-- pre-existing cron columns are explicitly flagged in docs/FEATURES.md as
-- fast-follow wiring onto this SAME infra, not duplicated here.
create table if not exists saved_query_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  query_id uuid not null references saved_queries(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  -- Fixed vocabulary — same discipline as every other bounded-choice
  -- field in this build (custom role PERMISSIONS, workflow condition
  -- types, custom field types).
  cadence text not null check (cadence in ('hourly', 'daily', 'weekly')),
  last_run_at timestamptz,
  created_at timestamptz not null default now()
);

alter table saved_query_subscriptions enable row level security;
alter table saved_query_subscriptions force row level security;
create policy tenant_isolation_saved_query_subscriptions on saved_query_subscriptions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_saved_query_subscriptions_user on saved_query_subscriptions (tenant_id, user_id);

-- The scheduler is a genuinely CROSS-TENANT process (one cron tick has to
-- find due subscriptions across every tenant, not one) — the same problem
-- FORCE ROW LEVEL SECURITY exists specifically to make impossible for a
-- normal tenant-scoped connection to solve with a raw SELECT (see
-- db/pool.ts's docblock). Same fix as every other pre-auth/cross-tenant
-- lookup in this codebase (SAML ACS, public form resolution): a narrow
-- SECURITY DEFINER function returning only the scheduling metadata a cron
-- tick needs (never ticket/query content) — the tenant-scoped connection
-- picks that back up per-row via withTenant(tenantId, ...) to actually run
-- the query and read/write real data.
create or replace function public.list_due_subscriptions()
returns table (id uuid, tenant_id uuid, query_id uuid, project_id uuid, user_id uuid, cadence text)
language sql
security definer
set search_path = public
as $$
  select id, tenant_id, query_id, project_id, user_id, cadence
  from saved_query_subscriptions
  where
    (cadence = 'hourly' and (last_run_at is null or last_run_at < now() - interval '1 hour'))
    or (cadence = 'daily' and (last_run_at is null or last_run_at < now() - interval '1 day'))
    or (cadence = 'weekly' and (last_run_at is null or last_run_at < now() - interval '7 days'));
$$;

grant execute on function public.list_due_subscriptions() to eos_app;
grant select, insert, update, delete on saved_query_subscriptions to eos_app;
