-- PM service schema — Kanban/Scrum board configuration.
-- workflow_states is the state MACHINE (what a ticket can transition
-- through); a board COLUMN is a presentation grouping over 1+ of those
-- states (Jira lets "In Progress" cover both "Dev" and "Code Review"
-- states, for example) plus a WIP limit. Deliberately a separate concept
-- from workflow_states rather than reusing position/is_terminal on that
-- table — the workflow and the board people look at are configured
-- independently in both Jira and ADO, and conflating them would make it
-- impossible to ever group two states into one column.

create table if not exists board_columns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  position int not null,
  wip_limit int, -- null = no limit, matching Jira/ADO's default
  unique (project_id, position)
);

alter table board_columns enable row level security;
alter table board_columns force row level security;
create policy tenant_isolation_board_columns on board_columns
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Which workflow_state(s) map into each column. A state maps to exactly one
-- column (the unique constraint on workflow_state_id) — a ticket's board
-- position is fully determined by its current state, never ambiguous.
create table if not exists board_column_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  board_column_id uuid not null references board_columns(id) on delete cascade,
  workflow_state_id uuid not null references workflow_states(id) on delete cascade,
  unique (workflow_state_id)
);

alter table board_column_states enable row level security;
alter table board_column_states force row level security;
create policy tenant_isolation_board_column_states on board_column_states
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_board_columns_project on board_columns (project_id, position);
