-- §11.7 OKRs linked to Epics: company Objectives with measurable Key
-- Results, tracking business-outcome progress against real engineering
-- delivery. A key result can OPTIONALLY link to an Epic ticket, in which
-- case its progress is computed automatically from that epic's real child
-- ticket completion (not a manually-updated number a human forgets to
-- touch) — see okrs.service.ts's progressFor(). A key result with no
-- linked epic tracks a plain manual current/target value instead (not
-- every business outcome maps to one epic — "reduce support tickets 20%"
-- doesn't).

create table if not exists objectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null,
  description text not null default '',
  owner_user_id uuid,
  period text not null,              -- e.g. 'Q3 2026' — free text, no calendar system enforced
  status text not null default 'active', -- 'active' | 'completed' | 'abandoned'
  created_at timestamptz not null default now()
);

alter table objectives enable row level security;
alter table objectives force row level security;
create policy tenant_isolation_objectives on objectives
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists key_results (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  objective_id uuid not null references objectives(id) on delete cascade,
  title text not null,
  epic_ticket_id uuid references tickets(id) on delete set null, -- optional: drives automatic progress
  target_value numeric(12,2) not null default 100,
  current_value numeric(12,2) not null default 0, -- manual progress; ignored when epic_ticket_id is set
  unit text not null default '%',
  created_at timestamptz not null default now()
);

alter table key_results enable row level security;
alter table key_results force row level security;
create policy tenant_isolation_key_results on key_results
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_key_results_objective on key_results (objective_id);
create index if not exists idx_key_results_epic on key_results (epic_ticket_id) where epic_ticket_id is not null;

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
