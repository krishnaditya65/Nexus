-- billing service — plans, subscriptions, usage-based metering,
-- entitlements/usage caps, and invoice generation. Stripe/Orb-style, built
-- in-house here since this platform IS the product being metered.

create extension if not exists "pgcrypto";

-- Shared catalog data, not tenant-scoped by design — every tenant reads the
-- same plan list, so this table intentionally has no tenant_id/RLS.
create table if not exists plans (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,       -- 'starter' | 'standard' | 'enterprise'
  name text not null,
  seat_price_cents int not null,
  billing_period text not null default 'monthly', -- 'monthly' | 'annual'
  created_at timestamptz not null default now()
);

create table if not exists tenant_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  plan_id uuid not null references plans(id),
  seat_count int not null default 1,
  status text not null default 'active',  -- 'active' | 'canceled' | 'past_due'
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz not null default (now() + interval '30 days'),
  created_at timestamptz not null default now(),
  unique (tenant_id)
);

alter table tenant_subscriptions enable row level security;
alter table tenant_subscriptions force row level security;
create policy tenant_isolation_tenant_subscriptions on tenant_subscriptions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Raw usage events — the metering ledger. Every billable action any service
-- performs (an API call through api-platform, a CI runner-minute, a GB of
-- object storage) writes one row here; invoices are computed FROM this, not
-- from a running counter, so the ledger stays the audit-defensible source.
create table if not exists usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  metric text not null,           -- 'api_calls' | 'ci_minutes' | 'storage_gb' | 'seats'
  quantity numeric not null,
  recorded_at timestamptz not null default now(),
  source_service text not null default 'unknown'
);

alter table usage_events enable row level security;
alter table usage_events force row level security;
create policy tenant_isolation_usage_events on usage_events
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_usage_events_tenant_metric_time
  on usage_events (tenant_id, metric, recorded_at desc);

-- Per-tenant, per-feature usage caps — what api-platform's rate limiter and
-- the CI runner check before allowing further consumption on a maxed-out plan.
create table if not exists entitlements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  feature_key text not null,      -- 'api_calls_per_month' | 'ci_minutes_per_month' | 'storage_gb'
  limit_value numeric not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, feature_key)
);

alter table entitlements enable row level security;
alter table entitlements force row level security;
create policy tenant_isolation_entitlements on entitlements
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  period_start timestamptz not null,
  period_end timestamptz not null,
  amount_cents bigint not null,
  status text not null default 'draft',  -- 'draft' | 'issued' | 'paid' | 'void'
  line_items jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table invoices enable row level security;
alter table invoices force row level security;
create policy tenant_isolation_invoices on invoices
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

insert into plans (code, name, seat_price_cents, billing_period) values
  ('starter', 'Starter', 1500, 'monthly'),
  ('standard', 'Standard', 3500, 'monthly'),
  ('enterprise', 'Enterprise', 7500, 'monthly')
on conflict (code) do nothing;

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
