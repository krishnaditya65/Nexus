-- Time-based automation triggers (docs/FEATURES.md §13.3) — the fast-follow
-- explicitly flagged as unbuilt when §12.2's automation engine and §13.3's
-- scheduler infra first shipped ("hosting a @Cron tick that scans for
-- stale/overdue tickets ... is now a bounded follow-up, not a new infra
-- problem"). Adds one new trigger type, `stale_unassigned`, to the existing
-- fixed TRIGGER_TYPES vocabulary in automations.service.ts — a ticket that
-- has sat unassigned for at least `trigger_config.hours` hours since
-- creation. Genuinely time-based (fires on the PASSAGE of time, not on a
-- ticket write) — distinct from every other trigger type, which only ever
-- fires synchronously off a real ticket mutation.
--
-- Same cross-tenant scheduler problem as list_due_subscriptions()
-- (023_saved_query_subscriptions.sql) and the same fix: FORCE ROW LEVEL
-- SECURITY makes a normal tenant-scoped connection structurally unable to
-- see which OTHER tenants have a stale_unassigned automation enabled, so a
-- narrow SECURITY DEFINER function returns only the tenant_id list (never
-- automation config or ticket content) — the scheduler then re-enters each
-- tenant via withTenant(tenantId, ...) to do the actual scan/fire.
create or replace function public.list_tenants_with_stale_unassigned_automations()
returns table (tenant_id uuid)
language sql
security definer
set search_path = public
as $$
  select distinct tenant_id
  from automations
  where trigger_type = 'stale_unassigned' and enabled = true;
$$;

grant execute on function public.list_tenants_with_stale_unassigned_automations() to eos_app;
