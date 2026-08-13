-- Vendor/subscription spend tracking (docs/FEATURES.md §11.7) — distinct
-- from this service's own product-subscription billing (the `plans`/
-- `tenant_subscriptions`/`invoices` tables above bill the TENANT for
-- using this platform); this tracks what the tenant itself pays OUT to
-- third-party SaaS vendors, so it belongs in the same service as the
-- rest of this platform's financial data without being confused for it.
create table if not exists vendor_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  vendor_name text not null,
  category text not null default 'other',
  monthly_cost_cents int not null,
  currency text not null default 'usd',
  renewal_date date,
  notes text not null default '',
  created_at timestamptz not null default now()
);

alter table vendor_subscriptions enable row level security;
alter table vendor_subscriptions force row level security;
create policy tenant_isolation_vendor_subscriptions on vendor_subscriptions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
