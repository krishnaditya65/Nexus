-- Notification Schemes (docs/FEATURES.md §13.8) — a project-level admin
-- default for "who gets notified when a standard PM event happens",
-- distinct from §12.6's personal per-user mute preferences (which live
-- in services/notifications, not here) and §12.2's tenant-authored
-- automation engine (arbitrary "when X then Y" rules). No row for an
-- event type means the project uses notification-schemes.ts's
-- DEFAULT_NOTIFICATION_SCHEME; an explicit empty notify_roles array
-- means an admin deliberately turned that event's notifications off.
create table if not exists notification_scheme_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  event_type text not null check (event_type in ('ticket_created', 'status_changed', 'assigned')),
  notify_roles text[] not null default '{}', -- subset of 'assignee', 'watchers'
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, project_id, event_type)
);

alter table notification_scheme_rules enable row level security;
alter table notification_scheme_rules force row level security;
create policy tenant_isolation_notification_scheme_rules on notification_scheme_rules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
