-- Ticket watchers/subscriptions (docs/FEATURES.md §11.2) — notify-on-any-
-- change independent of assignee. This migration lands the data model +
-- API only; actual notification delivery on a ticket event is a future
-- wiring into services/notifications' existing push pipeline, same
-- "config surface ready, delivery worker pending" shape as compliance's
-- SIEM exports.

create table if not exists ticket_watchers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null references tickets(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (ticket_id, user_id)
);

alter table ticket_watchers enable row level security;
alter table ticket_watchers force row level security;
create policy tenant_isolation_ticket_watchers on ticket_watchers
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_ticket_watchers_ticket on ticket_watchers (ticket_id);

grant select, insert, update, delete on ticket_watchers to eos_app;
