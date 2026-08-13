-- §11.7 contractor invoicing: an invoice a tenant's own business issues to
-- ITS client for a contractor's approved timesheet hours — distinct from
-- `invoices` above (what the TENANT owes the PLATFORM for its subscription)
-- and from `vendor_subscriptions` (what the tenant pays OUT to third-party
-- SaaS). This is accounts-receivable the tenant generates for its own
-- clients, built from a real approved services/bi timesheet + real
-- services/bi rate card — see services/bi's TimesheetsController-adjacent
-- generate-invoice endpoint, the actual caller of POST /contractor-invoices.

create table if not exists contractor_invoices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  contractor_user_id uuid not null,
  timesheet_id uuid not null,       -- cross-reference into services/bi's timesheets; not enforced here (cross-service)
  client_name text not null default '',
  hours numeric(6,2) not null,
  rate_cents_per_hour int not null,
  amount_cents int not null,
  status text not null default 'issued', -- 'issued' | 'paid' | 'void'
  created_at timestamptz not null default now(),
  unique (tenant_id, timesheet_id)  -- one invoice per approved timesheet — regenerating is a no-op, not a duplicate
);

alter table contractor_invoices enable row level security;
alter table contractor_invoices force row level security;
create policy tenant_isolation_contractor_invoices on contractor_invoices
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
