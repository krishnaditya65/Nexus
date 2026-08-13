-- incident-management service — formal incident command (severity levels,
-- timeline, postmortems) plus a public status page. The platform that
-- triggers Chaos Engineering and pages on-call needs this workflow for
-- itself as much as for tenants running their own services on top of it.

create extension if not exists "pgcrypto";

create table if not exists incidents (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  title text not null,
  severity text not null,          -- 'sev1' | 'sev2' | 'sev3' | 'sev4' (sev1 = highest)
  status text not null default 'investigating', -- 'investigating' | 'identified' | 'monitoring' | 'resolved'
  commander_user_id uuid,
  started_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table incidents enable row level security;
alter table incidents force row level security;
create policy tenant_isolation_incidents on incidents
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists incident_updates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  incident_id uuid not null references incidents(id) on delete cascade,
  message text not null,
  posted_by_user_id uuid,
  posted_at timestamptz not null default now()
);

alter table incident_updates enable row level security;
alter table incident_updates force row level security;
create policy tenant_isolation_incident_updates on incident_updates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists postmortems (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  incident_id uuid not null unique references incidents(id) on delete cascade,
  summary text not null,
  root_cause text not null,
  action_items jsonb not null default '[]', -- [{ description, owner_user_id, status }]
  published_at timestamptz
);

alter table postmortems enable row level security;
alter table postmortems force row level security;
create policy tenant_isolation_postmortems on postmortems
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Status page components — the public-facing surface (status.<tenant>.example)
create table if not exists status_components (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tenant_slug text not null,      -- denormalized for the public, pre-auth status-page read
  name text not null,             -- e.g. "API", "Git Hosting", "CI/CD"
  current_status text not null default 'operational',
  -- 'operational' | 'degraded_performance' | 'partial_outage' | 'major_outage'
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table status_components enable row level security;
alter table status_components force row level security;
create policy tenant_isolation_status_components on status_components
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Public, unauthenticated read for the status page — same SECURITY DEFINER
-- pattern used for OIDC login / SCIM token resolution elsewhere: FORCE ROW
-- LEVEL SECURITY otherwise turns this into zero rows since no app.tenant_id
-- exists for an anonymous visitor.
create or replace function public.get_public_status_page(p_tenant_slug text)
returns table (component_name text, current_status text)
language sql
security definer
set search_path = public
as $$
  select name, current_status from status_components
  where tenant_slug = p_tenant_slug
  order by name;
$$;

grant execute on function public.get_public_status_page(text) to eos_app;
grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
