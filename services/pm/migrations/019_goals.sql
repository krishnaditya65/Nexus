-- Lightweight Goals (docs/FEATURES.md §12.5) — ClickUp's "Goals"
-- concept: a single target number with a progress bar, deliberately
-- WITHOUT the Objective/Key-Result ceremony §11.7's OKRs require. Not a
-- replacement for OKRs (objectives.sql, key_results.sql) — OKRs already
-- cover the serious business-outcome-tracking case, including automatic
-- progress from a linked Epic. A Goal is the lighter-weight everyday
-- version: "hit 500 signups this month," tracked manually, no epic link,
-- no period/objective grouping required.

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  goal_type text not null default 'numeric', -- 'numeric' | 'currency' | 'task_count'
  target_value numeric(14,2) not null,
  current_value numeric(14,2) not null default 0,
  unit text not null default '',
  status text not null default 'active', -- 'active' | 'achieved' | 'archived'
  owner_user_id uuid,
  due_date date,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table goals enable row level security;
alter table goals force row level security;
create policy tenant_isolation_goals on goals
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_goals_project on goals (project_id, created_at desc);

grant select, insert, update, delete on goals to eos_app;
