-- Problem Management (docs/FEATURES.md §13.7) — ITIL-style root-cause
-- tracking as a workflow DISTINCT from Incident response. An Incident is
-- "something is broken right now, restore service"; a Problem is "why does
-- this keep happening, and what's the permanent fix" — genuinely different
-- lifecycles (an incident resolves in hours; a problem can stay open for
-- weeks while a permanent fix is scheduled). One Problem can have MANY
-- linked Incidents (the same underlying root cause recurring), which is
-- why this is `incidents.problem_id` (many incidents -> one problem), not
-- the other way around.
--
-- Distinct from `postmortems` (001_init.sql): a postmortem is a single
-- incident's own retrospective document; a Problem is a standalone,
-- longer-lived investigation that can span — and outlive — several
-- incidents and their postmortems.
create table if not exists problems (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null,
  description text not null default '',
  -- Fixed vocabulary, same discipline as every other bounded-choice field
  -- in this build. 'known_error' is ITIL terminology: root cause AND a
  -- workaround are both identified, but the permanent fix isn't shipped
  -- yet — a real, meaningfully different state from plain 'investigating'.
  status text not null default 'new' check (status in ('new', 'investigating', 'known_error', 'resolved', 'closed')),
  root_cause text,
  workaround text,
  owner_user_id uuid,
  action_items jsonb not null default '[]', -- [{ description, owner_user_id, status }] — same shape as postmortems.action_items
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table problems enable row level security;
alter table problems force row level security;
create policy tenant_isolation_problems on problems
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

alter table incidents add column if not exists problem_id uuid references problems(id) on delete set null;
create index if not exists idx_incidents_problem on incidents (problem_id) where problem_id is not null;

grant select, insert, update, delete on problems to eos_app;
