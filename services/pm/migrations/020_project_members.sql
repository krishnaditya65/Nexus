-- Guest/external collaboration (docs/FEATURES.md §12.7) — explicit
-- per-project membership. For a normal (non-guest) tenant member this
-- table is never consulted at all (they see every project in their
-- tenant, same as always); it exists specifically to scope a GUEST
-- user (services/auth's users.is_guest, travels in the JWT) down to
-- only the project(s) they've been explicitly added to.
--
-- Honest, disclosed scope: this migration + ProjectGuestGuard enforce
-- membership on the project list and the core ticket read/write surface
-- (TicketsController) only — the single most-used data path a guest
-- would actually touch. It does NOT retrofit membership checks across
-- every one of pm's other 20+ modules (boards, wiki, releases, OKRs,
-- dashboards, etc.) — a guest who somehow learns another project's raw
-- ticket/wiki/board ids could still reach some of those other endpoints
-- directly. Full enforcement everywhere is the same scale of lift as
-- §11.1's still-pending custom role builder / field-level RBAC, and is
-- explicitly left as follow-up rather than silently gapped.

create table if not exists project_members (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  user_id uuid not null,
  added_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

alter table project_members enable row level security;
alter table project_members force row level security;
create policy tenant_isolation_project_members on project_members
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_project_members_user on project_members (tenant_id, user_id);

grant select, insert, update, delete on project_members to eos_app;
