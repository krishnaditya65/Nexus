-- Generic "when X then Y" automation/rules engine (docs/FEATURES.md
-- §12.2) — every trigger in this platform up to this point (auto-triage/
-- dedup, on-call paging, retention purge) was hardcoded TypeScript. This
-- is the first tenant-CONFIGURABLE trigger→action rule. Deliberately
-- event-driven only (fires synchronously off a real ticket write, inside
-- the same request that caused it) — there is still no cron/scheduler
-- infra anywhere in this repo (a documented, repeated limitation), so a
-- true time-based trigger like "unassigned for 1 hour" is explicitly OUT
-- of scope for this pass; see automations.service.ts's docblock.

create table if not exists automations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  trigger_type text not null, -- 'ticket_created' | 'status_changed' | 'assigned'
  trigger_config jsonb not null default '{}', -- e.g. {"toStateName": "Done"} for status_changed
  action_type text not null, -- 'notify_watchers' | 'notify_assignee' | 'transition' | 'assign_user'
  action_config jsonb not null default '{}', -- e.g. {"transitionName": "Move to QA"} or {"userId": "..."}
  enabled boolean not null default true,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table automations enable row level security;
alter table automations force row level security;
create policy tenant_isolation_automations on automations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_automations_project_trigger on automations (project_id, trigger_type) where enabled;

-- Every firing is logged — same "an unrun/failed automation should be
-- debuggable, not silent" reasoning as retention_purge_runs and
-- last_verified_restore_at elsewhere in this build.
create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  automation_id uuid not null references automations(id) on delete cascade,
  ticket_id uuid not null references tickets(id) on delete cascade,
  status text not null, -- 'succeeded' | 'failed'
  detail text,
  ran_at timestamptz not null default now()
);

alter table automation_runs enable row level security;
alter table automation_runs force row level security;
create policy tenant_isolation_automation_runs on automation_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_automation_runs_automation on automation_runs (automation_id, ran_at desc);

grant select, insert, update, delete on automations, automation_runs to eos_app;
