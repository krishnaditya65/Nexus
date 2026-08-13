-- bi service — time tracking/timesheets (services/billing now owns the
-- financial-metering half: hourly rates, CapEx/OpEx, invoices) and Monte
-- Carlo delivery forecasting, which reads live ticket data from
-- services/pm over HTTP rather than duplicating it here.

create extension if not exists "pgcrypto";

create table if not exists time_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  ticket_id uuid,   -- cross-reference into services/pm, not enforced here
  minutes int not null,
  entry_date date not null default current_date,
  description text not null default '',
  created_at timestamptz not null default now()
);

alter table time_entries enable row level security;
alter table time_entries force row level security;
create policy tenant_isolation_time_entries on time_entries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_time_entries_user_date on time_entries (user_id, entry_date);

create table if not exists timesheets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  week_start_date date not null,
  status text not null default 'draft', -- 'draft' | 'submitted' | 'approved' | 'rejected'
  submitted_at timestamptz,
  approved_by_user_id uuid,
  approved_at timestamptz,
  unique (tenant_id, user_id, week_start_date)
);

alter table timesheets enable row level security;
alter table timesheets force row level security;
create policy tenant_isolation_timesheets on timesheets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
