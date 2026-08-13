-- api-platform service — public API keys and outbound webhook delivery.
-- This is the ecosystem layer: every tool in this category (Slack, Jira,
-- GitHub) survives because of what plugs into it, not just native features.

create extension if not exists "pgcrypto";

create table if not exists api_keys (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  key_hash text not null,          -- sha256(raw key) — raw key shown once at creation
  key_prefix text not null,        -- first 8 chars, shown in listings so admins can tell keys apart
  scopes text[] not null default '{}',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);

alter table api_keys enable row level security;
alter table api_keys force row level security;
create policy tenant_isolation_api_keys on api_keys
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Pre-auth lookup (an API request resolves ITS tenant from this key), same
-- pattern as identity-federation's resolve_scim_token.
create or replace function public.resolve_api_key(p_key_hash text)
returns table (id uuid, tenant_id uuid, scopes text[])
language sql
security definer
set search_path = public
as $$
  select id, tenant_id, scopes from api_keys
  where key_hash = p_key_hash and revoked_at is null
  limit 1;
$$;

create table if not exists webhook_subscriptions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  target_url text not null,
  event_types text[] not null,      -- e.g. '{ticket.created,ticket.transitioned,pull_request.merged}'
  signing_secret_hash text not null, -- HMAC key for X-Nexus-Signature — raw shown once at creation
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);

alter table webhook_subscriptions enable row level security;
alter table webhook_subscriptions force row level security;
create policy tenant_isolation_webhook_subscriptions on webhook_subscriptions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  subscription_id uuid not null references webhook_subscriptions(id) on delete cascade,
  event_type text not null,
  payload jsonb not null,
  status text not null default 'pending', -- 'pending' | 'delivered' | 'failed'
  attempt_count int not null default 0,
  response_status int,
  last_attempted_at timestamptz,
  created_at timestamptz not null default now()
);

alter table webhook_deliveries enable row level security;
alter table webhook_deliveries force row level security;
create policy tenant_isolation_webhook_deliveries on webhook_deliveries
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_webhook_deliveries_status on webhook_deliveries (status, last_attempted_at);

grant execute on function public.resolve_api_key(text) to eos_app;
grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
