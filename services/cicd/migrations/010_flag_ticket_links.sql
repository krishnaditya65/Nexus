-- Feature-flag status on a ticket (docs/FEATURES.md §13.5, the last of
-- the Development Panel's three sub-items) — flags previously associated
-- to an environment only, with no way to ask "is the feature THIS ticket
-- is about currently on anywhere." A tenant admin links a flag to a
-- ticket key explicitly (same manual-but-real association the OIDC/SAML
-- config forms use — no attempt to infer this from a flag's name/key the
-- way commit/PR linking infers from a regex, since a flag key and a
-- ticket key have no shared naming convention to exploit).
create table if not exists flag_ticket_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  flag_id uuid not null references feature_flags(id) on delete cascade,
  ticket_key text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, flag_id, ticket_key)
);

alter table flag_ticket_links enable row level security;
alter table flag_ticket_links force row level security;
create policy tenant_isolation_flag_ticket_links on flag_ticket_links
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create index if not exists idx_flag_ticket_links_ticket on flag_ticket_links (tenant_id, ticket_key);
