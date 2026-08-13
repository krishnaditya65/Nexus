-- Exploratory testing sessions (docs/FEATURES.md §10 "Test Plans >
-- Exploratory sessions") — session-based charter-driven testing, distinct
-- from test_cases' scripted Gherkin scenarios: a tester opens a session
-- against a charter (a short mission statement, e.g. "explore the sprint
-- board's drag-and-drop under slow network"), logs free-form notes as they
-- go, optionally links a note to a bug ticket in services/pm, then closes
-- the session with a pass/fail-style outcome.

create table if not exists exploratory_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null,   -- cross-reference into services/pm, not enforced here
  charter text not null,
  tester_user_id uuid not null,
  status text not null default 'in_progress',  -- 'in_progress' | 'completed'
  outcome text,  -- 'passed' | 'issues_found' — set on completion; null while in_progress
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table exploratory_sessions enable row level security;
alter table exploratory_sessions force row level security;
create policy tenant_isolation_exploratory_sessions on exploratory_sessions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_exploratory_sessions_project on exploratory_sessions (project_id, started_at desc);

create table if not exists exploratory_notes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id uuid not null references exploratory_sessions(id) on delete cascade,
  note_text text not null,
  bug_ticket_id uuid,  -- cross-reference into services/pm, if this note turned into a filed bug
  created_at timestamptz not null default now()
);

alter table exploratory_notes enable row level security;
alter table exploratory_notes force row level security;
create policy tenant_isolation_exploratory_notes on exploratory_notes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_exploratory_notes_session on exploratory_notes (session_id, created_at);

grant select, insert, update, delete on exploratory_sessions, exploratory_notes to eos_app;
