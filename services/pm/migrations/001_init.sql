-- PM service schema — projects, tickets, custom workflow state machine.

create extension if not exists "pgcrypto";

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null,          -- short code, e.g. "ENG"
  name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

alter table projects enable row level security;
alter table projects force row level security;
create policy tenant_isolation_projects on projects
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Configurable workflow: a project's ticket lifecycle is an ordered list of
-- states plus a transition table, not a hardcoded enum. Ships with a default
-- Triage -> Dev -> QA -> Done workflow inserted per project.
create table if not exists workflow_states (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  position int not null,
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  unique (project_id, name)
);

alter table workflow_states enable row level security;
alter table workflow_states force row level security;
create policy tenant_isolation_workflow_states on workflow_states
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists workflow_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  from_state_id uuid not null references workflow_states(id) on delete cascade,
  to_state_id uuid not null references workflow_states(id) on delete cascade,
  name text not null  -- e.g. "Start Work", "Send to QA"
);

alter table workflow_transitions enable row level security;
alter table workflow_transitions force row level security;
create policy tenant_isolation_workflow_transitions on workflow_transitions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists tickets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  ticket_number int not null,            -- sequential per project, e.g. ENG-142
  type text not null default 'task',     -- 'epic' | 'story' | 'bug' | 'task'
  title text not null,
  description text not null default '',
  state_id uuid not null references workflow_states(id),
  assignee_user_id uuid,
  parent_ticket_id uuid references tickets(id),  -- for Epic -> Story hierarchy
  custom_fields jsonb not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, ticket_number)
);

alter table tickets enable row level security;
alter table tickets force row level security;
create policy tenant_isolation_tickets on tickets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_tickets_project on tickets (project_id, state_id);

-- Dependency graph: Blocks / Duplicates / Relates To (🟡 API pending, schema ready now)
create table if not exists ticket_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source_ticket_id uuid not null references tickets(id) on delete cascade,
  target_ticket_id uuid not null references tickets(id) on delete cascade,
  link_type text not null,  -- 'blocks' | 'duplicates' | 'relates_to'
  unique (source_ticket_id, target_ticket_id, link_type)
);

alter table ticket_links enable row level security;
alter table ticket_links force row level security;
create policy tenant_isolation_ticket_links on ticket_links
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Runtime app role (eos_app) — least privilege, RLS-enforced via `force`
-- above. Applies to this migration's tables now and any future ones in this
-- service's database, so later migrations don't need to repeat this block.
grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
