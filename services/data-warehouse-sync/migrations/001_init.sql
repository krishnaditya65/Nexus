-- data-warehouse-sync service — reverse-ETL: pushes this platform's data
-- into a tenant's own Snowflake/BigQuery/S3, on a schedule. Enterprises
-- consuming this platform's data always want it in their own warehouse
-- eventually, not just in our dashboards.

create extension if not exists "pgcrypto";

create table if not exists export_destinations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  destination_type text not null,   -- 'snowflake' | 'bigquery' | 's3_parquet'
  connection_config jsonb not null, -- 🟡 plaintext-at-rest, same BYOK/KMS gap as elsewhere
  schedule_cron text not null default '0 * * * *', -- hourly by default
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table export_destinations enable row level security;
alter table export_destinations force row level security;
create policy tenant_isolation_export_destinations on export_destinations
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists export_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  destination_id uuid not null references export_destinations(id) on delete cascade,
  status text not null default 'running', -- 'running' | 'completed' | 'failed'
  rows_exported int,
  output_path text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table export_runs enable row level security;
alter table export_runs force row level security;
create policy tenant_isolation_export_runs on export_runs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
