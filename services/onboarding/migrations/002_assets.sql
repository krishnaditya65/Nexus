-- Asset Management / CMDB (docs/FEATURES.md §13.7) — a real, queryable
-- asset registry, genuinely distinct from what already existed here.
-- `device_provisioning_records`/`license_assignments` (001_init.sql) are
-- EVENT logs: "a laptop was provisioned for this onboarding workflow, on
-- this date" — there was no persistent entity you could later query
-- ("what assets exist right now," "who currently has what," "is this
-- server's warranty about to expire") independent of the one-time task
-- that created it. This migration adds that entity.
--
-- Deliberately lightweight — hardware/software-license/server tracking
-- with a status lifecycle and optional assignment, not a full ITIL CMDB
-- (no CI relationship graph, no discovery agents, no service-mapping).
create table if not exists assets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_tag text not null,         -- human-facing identifier, e.g. "LAPTOP-0042"
  name text not null,
  -- Fixed vocabulary, same discipline as every other bounded-choice field
  -- in this build.
  asset_type text not null check (asset_type in ('hardware', 'software_license', 'server')),
  status text not null default 'in_stock' check (status in ('in_stock', 'in_use', 'maintenance', 'retired')),
  assigned_to_user_id uuid,
  serial_number text,
  purchase_date date,
  warranty_expires date,
  -- Loosely couples an asset to the onboarding task that provisioned it,
  -- when there was one — nullable because plenty of assets (a server
  -- rack, a pre-existing license pool) were never provisioned via an
  -- onboarding workflow at all.
  provisioning_task_id uuid references onboarding_tasks(id) on delete set null,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (tenant_id, asset_tag)
);

alter table assets enable row level security;
alter table assets force row level security;
create policy tenant_isolation_assets on assets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_assets_assigned_to on assets (assigned_to_user_id) where assigned_to_user_id is not null;

-- Ticket <-> asset links — a PM ticket ("laptop won't boot") linkable to
-- the specific asset it's about. `ticket_id` is a bare id with NO foreign
-- key (tickets live in a different service's database entirely) — same
-- cross-service reference shape as cicd's `flag_ticket_links`, resolved
-- by ticket key at the API/frontend layer, not a DB join.
create table if not exists asset_ticket_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  asset_id uuid not null references assets(id) on delete cascade,
  ticket_id uuid not null,
  ticket_key text not null,   -- denormalized "{project.key}-{ticket_number}" for display without a round trip
  created_at timestamptz not null default now(),
  unique (asset_id, ticket_id)
);

alter table asset_ticket_links enable row level security;
alter table asset_ticket_links force row level security;
create policy tenant_isolation_asset_ticket_links on asset_ticket_links
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_asset_ticket_links_ticket on asset_ticket_links (ticket_id);

grant select, insert, update, delete on assets, asset_ticket_links to eos_app;
