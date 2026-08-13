-- Self-hosted / BYO runner registration (docs/FEATURES.md §11.4) — today
-- every pipeline step runs as a `docker run` container on whatever host
-- this NestJS service itself is deployed on (see runner.service.ts). This
-- adds a second execution path: a step can declare `runsOn: <label>` to
-- be picked up by an external agent process (e.g. running on-prem or on a
-- GPU box the platform doesn't own) instead of running locally.
--
-- `runners` are registered principals authenticated by a bearer token
-- distinct from a normal user JWT — a machine has no login session, so it
-- can't go through JwtAuthGuard. `runner_jobs.id` deliberately equals its
-- originating `pipeline_run_steps.id` rather than getting its own uuid —
-- one row per step either way, and reusing the id means completing a job
-- and completing a step are the same identifier, no separate join needed.
create table if not exists runners (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  labels text[] not null default '{}',
  -- scrypt hash of the raw per-runner secret — the secret itself is
  -- shown exactly once at registration time and never stored, same
  -- shown-once discipline as api-platform's webhook secrets and this
  -- session's own MFA recovery codes.
  token_hash text not null,
  status text not null default 'offline', -- 'offline' | 'online'
  last_heartbeat_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table runners enable row level security;
alter table runners force row level security;
drop policy if exists tenant_isolation_runners on runners;
create policy tenant_isolation_runners on runners
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists runner_jobs (
  id uuid primary key,
  tenant_id uuid not null,
  run_id uuid not null references pipeline_runs(id) on delete cascade,
  runner_label text not null,
  step_name text not null,
  image text,
  run_cmd text not null,
  -- the agent must clone the repo itself (it's a separate machine, not
  -- sharing this service's local workspace tmpdir) — repo_name/commit_ref
  -- are enough to do that against git-host. Deliberately NOT storing an
  -- auth token column here: the triggering request's bearer token is
  -- handed to the claiming agent in-memory only (JobBrokerService), once,
  -- same "never persist a credential" discipline as everywhere else in
  -- this platform.
  repo_name text not null,
  commit_ref text not null,
  status text not null default 'queued', -- 'queued' | 'claimed' | 'succeeded' | 'failed'
  claimed_by_runner_id uuid,
  claimed_at timestamptz,
  log text not null default '',
  exit_code int,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table runner_jobs enable row level security;
alter table runner_jobs force row level security;
drop policy if exists tenant_isolation_runner_jobs on runner_jobs;
create policy tenant_isolation_runner_jobs on runner_jobs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_runner_jobs_queue on runner_jobs (tenant_id, status, runner_label);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
