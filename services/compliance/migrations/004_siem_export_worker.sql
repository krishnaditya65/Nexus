-- SIEM export delivery worker (docs/FEATURES.md §11.1) — the config
-- surface (`siem_export_configs`, `SiemExportService.triggerExportNow`)
-- already existed; nothing ever called it on a schedule. This is that
-- worker's cross-tenant listing half.
--
-- Same "SECURITY DEFINER function, never a raw cross-tenant SELECT"
-- pattern as pm's `list_due_subscriptions()` (023_saved_query_
-- subscriptions.sql) — a scheduler tick has to find every enabled config
-- across every tenant, which FORCE ROW LEVEL SECURITY makes a normal
-- tenant-scoped connection structurally unable to do. No per-config
-- cadence field exists on `siem_export_configs` (just `is_enabled`), so
-- this simply lists every currently-enabled config — the worker calls
-- `triggerExportNow` for each, same real send path the manual trigger
-- already used.
create or replace function public.list_enabled_siem_exports()
returns table (id uuid, tenant_id uuid, destination text)
language sql
security definer
set search_path = public
as $$
  select id, tenant_id, destination from siem_export_configs where is_enabled = true;
$$;

grant execute on function public.list_enabled_siem_exports() to eos_app;
