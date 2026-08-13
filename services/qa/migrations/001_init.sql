-- qa service — test plans/suites, Gherkin/BDD cases, JUnit execution
-- ingestion, flaky-test quarantine, and the Requirement Traceability Matrix
-- (which reads services/pm's tickets over HTTP — see rtm.service.ts —
-- rather than joining across databases directly, per this platform's
-- cross-service convention).

create extension if not exists "pgcrypto";

create table if not exists test_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,   -- cross-reference into services/pm, not enforced here
  name text not null,
  release_ref text,
  created_at timestamptz not null default now()
);

alter table test_plans enable row level security;
alter table test_plans force row level security;
create policy tenant_isolation_test_plans on test_plans
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists test_cases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  plan_id uuid not null references test_plans(id) on delete cascade,
  title text not null,
  -- Raw Gherkin (Given/When/Then) — parsed at read time (see gherkin.ts),
  -- not normalized into rows, same reasoning as cicd's yaml_definition.
  gherkin_text text,
  requirement_ticket_id uuid, -- cross-reference into services/pm; RTM's join key
  created_at timestamptz not null default now()
);

alter table test_cases enable row level security;
alter table test_cases force row level security;
create policy tenant_isolation_test_cases on test_cases
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_test_cases_requirement on test_cases (requirement_ticket_id) where requirement_ticket_id is not null;

create table if not exists test_executions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  test_case_id uuid not null references test_cases(id) on delete cascade,
  cicd_run_id uuid,  -- cross-reference into services/cicd's pipeline_runs, if ingested from CI
  status text not null,  -- 'passed' | 'failed' | 'skipped'
  duration_ms int,
  error_message text,
  executed_at timestamptz not null default now()
);

alter table test_executions enable row level security;
alter table test_executions force row level security;
create policy tenant_isolation_test_executions on test_executions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_test_executions_case_time on test_executions (test_case_id, executed_at desc);

create table if not exists flaky_test_flags (
  test_case_id uuid primary key references test_cases(id) on delete cascade,
  tenant_id uuid not null,
  flagged_at timestamptz not null default now(),
  recent_pass_count int not null,
  recent_fail_count int not null,
  quarantined boolean not null default true
);

alter table flaky_test_flags enable row level security;
alter table flaky_test_flags force row level security;
create policy tenant_isolation_flaky_test_flags on flaky_test_flags
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
