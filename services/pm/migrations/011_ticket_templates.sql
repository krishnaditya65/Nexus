-- Ticket templates (docs/FEATURES.md §11.2 "Ticket templates") —
-- pre-filled field sets for common ticket shapes (e.g. "Security
-- Incident", "Customer Bug"). A template pre-fills type/title/
-- description at creation time; it's a starting point, not a locked
-- schema — nothing about the created ticket is different from any other
-- ticket afterward.

create table if not exists ticket_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  ticket_type text not null,
  title_template text not null,
  description_template text not null default '',
  created_at timestamptz not null default now(),
  unique (project_id, name)
);

alter table ticket_templates enable row level security;
alter table ticket_templates force row level security;
create policy tenant_isolation_ticket_templates on ticket_templates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update, delete on ticket_templates to eos_app;
