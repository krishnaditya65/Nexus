-- onboarding service — orchestrates what SCIM alone doesn't cover: device
-- provisioning, license assignment, and HR-system-driven lifecycle events
-- (Workday/BambooHR), each tracked as its own task under one workflow.

create extension if not exists "pgcrypto";

create table if not exists onboarding_workflows (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  employee_email text not null,
  employee_display_name text not null,
  workflow_type text not null default 'onboarding', -- 'onboarding' | 'offboarding'
  status text not null default 'pending',            -- 'pending' | 'in_progress' | 'completed' | 'failed'
  hr_source text,                                     -- 'workday' | 'bamboohr' | 'manual'
  hr_external_employee_id text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table onboarding_workflows enable row level security;
alter table onboarding_workflows force row level security;
create policy tenant_isolation_onboarding_workflows on onboarding_workflows
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid not null references onboarding_workflows(id) on delete cascade,
  task_type text not null,       -- 'account_provisioning' | 'device_provisioning' | 'license_assignment'
  status text not null default 'pending', -- 'pending' | 'completed' | 'failed'
  detail jsonb not null default '{}',
  completed_at timestamptz
);

alter table onboarding_tasks enable row level security;
alter table onboarding_tasks force row level security;
create policy tenant_isolation_onboarding_tasks on onboarding_tasks
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Raw HR webhook events, kept even after processing — this is the audit
-- trail proving why a given onboarding/offboarding workflow fired.
create table if not exists hr_sync_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  source text not null,           -- 'workday' | 'bamboohr'
  event_type text not null,       -- 'hired' | 'terminated' | 'updated'
  external_employee_id text not null,
  raw_payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz
);

alter table hr_sync_events enable row level security;
alter table hr_sync_events force row level security;
create policy tenant_isolation_hr_sync_events on hr_sync_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists license_assignments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid references onboarding_workflows(id) on delete set null,
  employee_email text not null,
  license_sku text not null,      -- e.g. 'seat:standard', 'seat:enterprise', 'addon:ai-platform'
  assigned_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table license_assignments enable row level security;
alter table license_assignments force row level security;
create policy tenant_isolation_license_assignments on license_assignments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists device_provisioning_records (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  workflow_id uuid references onboarding_workflows(id) on delete set null,
  employee_email text not null,
  device_type text not null,      -- 'laptop' | 'mobile' | 'yubikey'
  mdm_enrollment_status text not null default 'requested', -- 'requested' | 'enrolled' | 'wiped'
  requested_at timestamptz not null default now(),
  resolved_at timestamptz
);

alter table device_provisioning_records enable row level security;
alter table device_provisioning_records force row level security;
create policy tenant_isolation_device_provisioning on device_provisioning_records
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Bearer secrets HR systems (Workday/BambooHR) present on every webhook call
-- — same shape as identity-federation's scim_tokens, kept separate because
-- these two integrations rotate on different schedules and are owned by
-- different admin flows (HR/IT vs. security).
create table if not exists hr_webhook_secrets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tenant_slug text not null,
  source text not null,          -- 'workday' | 'bamboohr'
  secret_hash text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  unique (tenant_id, source)
);

alter table hr_webhook_secrets enable row level security;
alter table hr_webhook_secrets force row level security;
create policy tenant_isolation_hr_webhook_secrets on hr_webhook_secrets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Webhook calls resolve their tenant FROM this secret, so app.tenant_id
-- can't be set before the lookup runs (same pattern as
-- identity-federation's resolve_scim_token — see that migration's comment).
create or replace function public.resolve_hr_webhook_secret(p_secret_hash text, p_source text)
returns table (tenant_id uuid, tenant_slug text)
language sql
security definer
set search_path = public
as $$
  select tenant_id, tenant_slug from hr_webhook_secrets
  where secret_hash = p_secret_hash and source = p_source and revoked_at is null
  limit 1;
$$;

grant execute on function public.resolve_hr_webhook_secret(text, text) to eos_app;

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
