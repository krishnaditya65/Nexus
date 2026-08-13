-- PM service schema — sprints (iterations) + backlog ranking + estimation.
-- Closes the single biggest gap vs. Jira/Azure DevOps Boards: 001_init.sql
-- gave this service a ticket tracker with a configurable workflow, but
-- neither Jira nor ADO's identity is "ticket tracker" — it's agile
-- planning, which requires sprints, a rankable backlog, and story points.
-- See docs/ROADMAP.md's Phase 4 entry for the full gap analysis.

create table if not exists sprints (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  goal text not null default '',
  status text not null default 'planned', -- 'planned' | 'active' | 'completed'
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table sprints enable row level security;
alter table sprints force row level security;
create policy tenant_isolation_sprints on sprints
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Mirrors Jira/ADO's single-active-sprint-per-board constraint at the data
-- layer, not just in application code — starting a second sprint on a
-- project that already has one active fails on this index, not silently.
create unique index if not exists idx_sprints_one_active_per_project
  on sprints (project_id) where status = 'active';

create index if not exists idx_sprints_project_status on sprints (project_id, status);

alter table tickets add column if not exists sprint_id uuid references sprints(id) on delete set null;
-- null sprint_id = backlog, exactly like Jira's "Backlog" bucket being
-- "not yet assigned to a sprint" rather than a distinct table.

alter table tickets add column if not exists story_points numeric;

-- Backlog ordering: a plain sortable float rather than a full LexoRank
-- string implementation. New tickets append at the end (max + 1000);
-- reordering takes the midpoint of the two neighboring ranks. Documented,
-- known limitation: enough successive insertions between the exact same
-- two neighbors will eventually exhaust float precision and require a
-- rebalance pass — acceptable for a first cut, same "good enough for
-- Phase 1, revisit if it becomes a real problem" stance as the Monte Carlo
-- forecaster's completion-date proxy (see services/bi/forecasting.service.ts).
alter table tickets add column if not exists backlog_rank double precision;

create index if not exists idx_tickets_sprint on tickets (sprint_id);
create index if not exists idx_tickets_backlog_rank on tickets (project_id, backlog_rank);
