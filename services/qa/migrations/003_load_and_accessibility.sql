-- Load/performance testing integration + accessibility (WCAG) audit
-- ingestion (docs/FEATURES.md §11.5) — both follow the same "ingest a
-- real external tool's report format" pattern JUnit ingestion already
-- established, just for two different well-known formats: k6's summary
-- JSON (load/perf) and axe-core's JSON (accessibility). Distinct from
-- JUnit's pass/fail-per-testcase shape, so these get their own tables
-- rather than being shoehorned into test_executions.
create table if not exists load_test_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  plan_id uuid not null references test_plans(id) on delete cascade,
  tool text not null default 'k6',
  vus int,
  iterations int,
  http_req_count int,
  http_req_failed_rate numeric,
  p95_duration_ms numeric,
  p99_duration_ms numeric,
  avg_duration_ms numeric,
  raw_metrics jsonb not null,
  cicd_run_id uuid,
  recorded_at timestamptz not null default now()
);

alter table load_test_runs enable row level security;
alter table load_test_runs force row level security;
drop policy if exists tenant_isolation_load_test_runs on load_test_runs;
create policy tenant_isolation_load_test_runs on load_test_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists accessibility_audits (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  plan_id uuid not null references test_plans(id) on delete cascade,
  url text,
  critical_count int not null default 0,
  serious_count int not null default 0,
  moderate_count int not null default 0,
  minor_count int not null default 0,
  violations jsonb not null,
  cicd_run_id uuid,
  recorded_at timestamptz not null default now()
);

alter table accessibility_audits enable row level security;
alter table accessibility_audits force row level security;
drop policy if exists tenant_isolation_accessibility_audits on accessibility_audits;
create policy tenant_isolation_accessibility_audits on accessibility_audits
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
