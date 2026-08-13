-- cicd service — environments, deployments (promotion + approval gates),
-- and freeze windows. Closes Phase 5 item 1 of docs/ROADMAP.md: the
-- prerequisite most of ADO Pipelines' "release management" story sits on
-- top of. An `environment` here is a named promotion target (Dev/Staging/
-- Prod, tenant-defined order); a `deployment` tracks ONE pipeline_run being
-- promoted into ONE environment, gated by approval if that environment
-- requires it. The actual "did bytes move to a server" work is still the
-- pipeline run's own steps (real `docker run` per step, see
-- runner.service.ts) — this layer is the promotion/approval bookkeeping on
-- top of an already-executed run, the same real semantic Azure DevOps
-- Environments has (it's a gate + audit trail over deployment jobs, not a
-- deployment mechanism unto itself).

create table if not exists environments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  name text not null,
  position int not null, -- promotion order: e.g. Dev(0) -> Staging(1) -> Prod(2)
  requires_approval boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, repo_name, name),
  unique (tenant_id, repo_name, position)
);

alter table environments enable row level security;
alter table environments force row level security;
create policy tenant_isolation_environments on environments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists deployments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  environment_id uuid not null references environments(id) on delete cascade,
  pipeline_run_id uuid not null references pipeline_runs(id) on delete cascade,
  status text not null default 'pending_approval', -- 'pending_approval' | 'approved' | 'rejected' | 'deployed'
  requested_by_user_id uuid not null,
  approved_by_user_id uuid,
  rejection_reason text,
  requested_at timestamptz not null default now(),
  approved_at timestamptz,
  deployed_at timestamptz
);

alter table deployments enable row level security;
alter table deployments force row level security;
create policy tenant_isolation_deployments on deployments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_deployments_environment on deployments (environment_id, requested_at desc);

-- Freeze/maintenance windows: block new deployment requests into an
-- environment while one is active ("no deployments during Black Friday",
-- the exact example from the original feature manifest). Deliberately
-- blocks REQUESTING a deployment, not pipeline runs themselves — a team can
-- still build/test during a freeze, they just can't promote into the
-- frozen environment until it lifts.
create table if not exists freeze_windows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  environment_id uuid not null references environments(id) on delete cascade,
  reason text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

alter table freeze_windows enable row level security;
alter table freeze_windows force row level security;
create policy tenant_isolation_freeze_windows on freeze_windows
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_freeze_windows_environment on freeze_windows (environment_id, starts_at, ends_at);
