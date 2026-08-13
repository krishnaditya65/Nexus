-- Delivery Plans (docs/FEATURES.md §10 "Boards > Delivery Plans") — a
-- named, saved cross-project timeline: pick a set of projects, get back
-- every one of their sprints (start/end dates + status) on one shared
-- timeline. Scope note: ADO's Delivery Plans can also show epic-level
-- date bars, but this schema has no target-date concept on epics (only
-- sprints carry start_date/end_date) — that's a real, separate gap, not
-- silently faked here with invented dates. What ships is the genuinely
-- new cross-project piece: today every sprint/backlog view is scoped to
-- one project, this is the first view that spans several at once.

create table if not exists delivery_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  project_ids uuid[] not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table delivery_plans enable row level security;
alter table delivery_plans force row level security;
create policy tenant_isolation_delivery_plans on delivery_plans
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update, delete on delivery_plans to eos_app;
