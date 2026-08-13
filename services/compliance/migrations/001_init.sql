-- compliance service — data residency, disaster-recovery policy registry,
-- tenant data export ("right to leave"), and SIEM export configuration.
-- This is the service enterprise security questionnaires actually probe.

create extension if not exists "pgcrypto";

create table if not exists data_residency_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  region text not null,           -- 'eu' | 'us' | 'apac' — where this tenant's data must physically live
  enforced boolean not null default true,
  notes text not null default '',
  created_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table data_residency_policies enable row level security;
alter table data_residency_policies force row level security;
create policy tenant_isolation_data_residency_policies on data_residency_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- One row per data class per tenant — Git repos, chat history, and financial
-- ledgers genuinely warrant different RPO/RTO, which is exactly why this
-- isn't a single platform-wide SLA number.
create table if not exists backup_policies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  data_class text not null,       -- 'git_repos' | 'chat_history' | 'financial_ledgers' | 'tickets' | 'audit_logs'
  rpo_minutes int not null,       -- max acceptable data loss window
  rto_minutes int not null,       -- max acceptable time-to-restore
  backup_frequency text not null, -- 'continuous' | 'hourly' | 'daily'
  retention_days int not null,
  last_verified_restore_at timestamptz,  -- untested backups aren't backups
  created_at timestamptz not null default now(),
  unique (tenant_id, data_class)
);

alter table backup_policies enable row level security;
alter table backup_policies force row level security;
create policy tenant_isolation_backup_policies on backup_policies
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Tenant offboarding / GDPR data portability. Each job aggregates this
-- tenant's data from every owning service into one downloadable bundle.
create table if not exists data_export_jobs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  requested_by_user_id uuid not null,
  status text not null default 'pending',  -- 'pending' | 'processing' | 'completed' | 'failed'
  bundle_path text,               -- local path today; object-storage URL once wired to MinIO/S3
  bundle_size_bytes bigint,
  failure_reason text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table data_export_jobs enable row level security;
alter table data_export_jobs force row level security;
create policy tenant_isolation_data_export_jobs on data_export_jobs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- SIEM export configuration (Splunk/Datadog) — the delivery worker that
-- reads services/auth's audit_log and ships it here is 🟡, this is the
-- config surface for it.
create table if not exists siem_export_configs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  destination text not null,      -- 'splunk' | 'datadog'
  endpoint_url text not null,
  auth_token_encrypted text not null,  -- 🟡 plaintext-at-rest for now, same BYOK gap noted elsewhere
  is_enabled boolean not null default true,
  last_exported_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, destination)
);

alter table siem_export_configs enable row level security;
alter table siem_export_configs force row level security;
create policy tenant_isolation_siem_export_configs on siem_export_configs
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
