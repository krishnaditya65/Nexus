-- Notification inbox (docs/FEATURES.md §12.6) — `notification_deliveries`
-- has recorded EVERY notification ever sent (mentions, pages, approval
-- nudges, now automations) since 001_init.sql, including ones with
-- status = 'no_subscription' (no push device registered) — but nothing
-- ever exposed that table back to the user who received them. This is
-- the whole gap: a real per-user "here's everything that happened to
-- you" feed, reusing data that already existed rather than adding a new
-- delivery pipeline.

alter table notification_deliveries add column if not exists read_at timestamptz;

create index if not exists idx_notification_deliveries_user_unread
  on notification_deliveries (tenant_id, user_id, created_at desc)
  where read_at is null;
