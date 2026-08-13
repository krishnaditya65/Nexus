-- notifications service — web push only, per product decision (no native
-- mobile app in this build). Covers the on-call paging / approval-nudge use
-- case the original spec's "Mobile" item was actually asking for.

create extension if not exists "pgcrypto";

create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  unique (tenant_id, user_id, endpoint)
);

alter table push_subscriptions enable row level security;
alter table push_subscriptions force row level security;
create policy tenant_isolation_push_subscriptions on push_subscriptions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  title text not null,
  body text not null,
  category text not null default 'general', -- 'incident_page' | 'approval_request' | 'mention' | 'general'
  status text not null default 'sent',       -- 'sent' | 'failed' | 'no_subscription'
  created_at timestamptz not null default now()
);

alter table notification_deliveries enable row level security;
alter table notification_deliveries force row level security;
create policy tenant_isolation_notification_deliveries on notification_deliveries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
