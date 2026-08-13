-- cicd service — YAML pipeline definitions, runs, and per-step execution
-- records. Runner executes steps as real `docker run` containers (see
-- src/runs/runner.service.ts) — not a simulated/faked execution.

create extension if not exists "pgcrypto";

create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  name text not null,
  -- Raw YAML, parsed at run time (see PipelineDefinition in runner.service.ts)
  -- rather than normalized into rows — keeps this a straightforward diff-able
  -- text blob, the same reason CI systems store pipeline-as-code as YAML in
  -- the first place, not a form-built config.
  yaml_definition text not null,
  trigger_event_types text[] not null default '{}', -- e.g. '{pull_request.merged}'
  created_at timestamptz not null default now(),
  unique (tenant_id, repo_name, name)
);

alter table pipelines enable row level security;
alter table pipelines force row level security;
create policy tenant_isolation_pipelines on pipelines
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists pipeline_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  trigger_type text not null default 'manual', -- 'manual' | 'webhook'
  triggered_by_user_id uuid,
  commit_ref text not null default 'main',
  status text not null default 'queued', -- 'queued' | 'running' | 'succeeded' | 'failed'
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table pipeline_runs enable row level security;
alter table pipeline_runs force row level security;
create policy tenant_isolation_pipeline_runs on pipeline_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists pipeline_run_steps (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  step_name text not null,
  status text not null default 'pending', -- 'pending' | 'running' | 'succeeded' | 'failed'
  log text not null default '',
  exit_code int,
  started_at timestamptz,
  completed_at timestamptz
);

alter table pipeline_run_steps enable row level security;
alter table pipeline_run_steps force row level security;
create policy tenant_isolation_pipeline_run_steps on pipeline_run_steps
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_pipeline_run_steps_run on pipeline_run_steps (run_id);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
