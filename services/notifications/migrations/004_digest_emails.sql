-- Digest emails (docs/FEATURES.md §12.6) — previously blocked on "no
-- email-sending infra exists in this repo at all"; that infra now exists
-- (EmailService, §13.3) and the source data already exists too
-- (notification_deliveries, written by every push send since 001_init.sql).
-- This is the batching layer: a per-user opt-in frequency, and a
-- scheduled job that rolls up what landed in notification_deliveries
-- since the user's last digest into one email instead of N pushes.
create table if not exists user_digest_settings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  -- 'off' is the default — this is genuinely opt-IN (unlike
  -- notification_preferences' opt-out mute), since turning digest email
  -- ON for a user who never asked for it would mean sending mail they
  -- didn't request.
  frequency text not null default 'off' check (frequency in ('off', 'daily', 'weekly')),
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id)
);

alter table user_digest_settings enable row level security;
alter table user_digest_settings force row level security;
create policy tenant_isolation_user_digest_settings on user_digest_settings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Same cross-tenant scheduler problem as every other `list_*_due_*()`
-- function in this build (list_due_subscriptions, list_enabled_siem_
-- exports, list_tenants_with_stale_unassigned_automations) — FORCE ROW
-- LEVEL SECURITY makes a normal tenant-scoped connection structurally
-- unable to see which users across OTHER tenants are due; this SECURITY
-- DEFINER function returns only the scheduling metadata a cron tick
-- needs, never notification content — the tenant-scoped connection picks
-- that back up per-row via withTenant(tenantId, ...) to read the real
-- deliveries and send the real email.
create or replace function public.list_users_due_for_digest()
returns table (tenant_id uuid, user_id uuid, frequency text, last_sent_at timestamptz)
language sql
security definer
set search_path = public
as $$
  select tenant_id, user_id, frequency, last_sent_at
  from user_digest_settings
  where
    (frequency = 'daily' and (last_sent_at is null or last_sent_at < now() - interval '1 day'))
    or (frequency = 'weekly' and (last_sent_at is null or last_sent_at < now() - interval '7 days'));
$$;

grant execute on function public.list_users_due_for_digest() to eos_app;
grant select, insert, update, delete on user_digest_settings to eos_app;
