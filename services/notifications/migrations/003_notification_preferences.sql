-- Per-user, per-project notification preferences (docs/FEATURES.md §12.6)
-- — a user can mute a category of push notification either everywhere
-- (project_id null — the "global default for me" row) or for one
-- specific project only (a real "project_id" row takes precedence over
-- the global one for that project). Opt-OUT model: no row at all means
-- enabled — every existing user's behavior is completely unchanged
-- until they explicitly mute something, same "additive, never
-- restrictive by default" discipline as this build's other opt-in
-- security toggles (mfa_required, device_challenge_required).
--
-- `category` is the SAME fixed vocabulary `notification_deliveries.
-- category` already uses informally (see 001_init.sql's comment) — now
-- actually enforced at the application layer (preferences.ts's
-- NOTIFICATION_CATEGORIES), not just documented in a comment.
create table if not exists notification_preferences (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  project_id uuid, -- null = the user's global default for this category
  category text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, user_id, category, project_id)
);

-- Postgres treats every NULL as distinct for a plain unique constraint,
-- so `unique (..., project_id)` above does NOT stop a user from
-- inserting two global (project_id IS NULL) rows for the same category.
-- This partial unique index closes that gap specifically for the
-- project_id IS NULL case; the project-specific case is already covered
-- by the constraint above since project_id is never null there.
create unique index if not exists idx_notification_preferences_global_unique
  on notification_preferences (tenant_id, user_id, category)
  where project_id is null;

alter table notification_preferences enable row level security;
alter table notification_preferences force row level security;
create policy tenant_isolation_notification_preferences on notification_preferences
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- 'muted' joins the existing 'sent' | 'failed' | 'no_subscription' — a
-- notification suppressed by this table is still recorded (same "an
-- untested/unsent thing shouldn't be invisible" reasoning as every other
-- status this column already tracks), just never pushed to a device.
comment on column notification_deliveries.status is
  'sent | failed | no_subscription | muted (suppressed by notification_preferences)';
