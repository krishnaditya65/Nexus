-- APM-triggered auto-rollback (docs/FEATURES.md §11.4) — deployments/
-- canary already modeled traffic percentage and staged approval, but
-- nothing watched real error-rate telemetry and triggered an automatic
-- rollback on a threshold breach. This adds a real ingestion endpoint
-- (POST /deployments/:id/metrics) an APM agent/exporter pushes samples
-- to, and an opt-in threshold checked synchronously on each ingested
-- 'error_rate' sample — no separate polling loop needed since this is
-- push-based, the same reasoning secretscan's on-push (not scheduled)
-- trigger already used elsewhere in this codebase.
alter table deployments add column if not exists auto_rollback_error_rate_threshold numeric;

create table if not exists deployment_metrics (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  deployment_id uuid not null references deployments(id) on delete cascade,
  metric_name text not null,
  value numeric not null,
  recorded_at timestamptz not null default now()
);

alter table deployment_metrics enable row level security;
alter table deployment_metrics force row level security;
drop policy if exists tenant_isolation_deployment_metrics on deployment_metrics;
create policy tenant_isolation_deployment_metrics on deployment_metrics
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_deployment_metrics_deployment on deployment_metrics (deployment_id, recorded_at desc);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
