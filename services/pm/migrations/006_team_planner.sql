-- Team planner (docs/FEATURES.md §2/§10) — per-sprint, per-person
-- capacity in story points, the same unit the rest of this app already
-- plans in (burndown, forecasting, backlog). ADO's own Team Planner uses
-- hours + days-off + activity type; that's a reasonable richer version to
-- grow into later, but it would introduce a second unit of measure
-- (hours) alongside every other capacity concept in this codebase already
-- being points — starting in points keeps "how full is this sprint" one
-- consistent number end to end instead of two you have to convert between.
create table if not exists sprint_capacities (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  sprint_id uuid not null references sprints(id) on delete cascade,
  user_id uuid not null,
  capacity_points numeric not null default 0,
  updated_at timestamptz not null default now(),
  unique (sprint_id, user_id)
);

alter table sprint_capacities enable row level security;
alter table sprint_capacities force row level security;
create policy tenant_isolation_sprint_capacities on sprint_capacities
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_sprint_capacities_sprint on sprint_capacities (sprint_id);
