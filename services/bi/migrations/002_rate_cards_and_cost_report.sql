-- Budget estimation from hourly rates × logged time, and CapEx/OpEx
-- categorization (docs/FEATURES.md §11.7) — `time_entries`/`timesheets`
-- already captured real logged hours; nothing turned that into a dollar
-- figure. One hourly rate per (tenant, user), not per-project — a
-- contractor typically bills at one rate regardless of which project
-- they logged time against; a real per-project override scheme is a
-- reasonable future extension, not modeled here.
create table if not exists user_hourly_rates (
  tenant_id uuid not null,
  user_id uuid not null,
  hourly_rate_cents int not null,
  currency text not null default 'usd',
  updated_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

alter table user_hourly_rates enable row level security;
alter table user_hourly_rates force row level security;
create policy tenant_isolation_user_hourly_rates on user_hourly_rates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
