-- Brute-force login detection + auto-lockout (docs/FEATURES.md §11.1) —
-- per-account (not per-IP; no request IP was ever threaded into
-- AuthService.login before this) failure counting with exponential
-- backoff. `failed_login_count` resets to 0 on any successful login;
-- `lockout_count` never resets (it's what drives the backoff multiplier
-- growing across separate lockout episodes, not within one) — a user
-- lookup that's already been locked out 3 times gets a longer lockout on
-- the 4th than a first-time offender does, the same escalating-response
-- shape most real auth systems use instead of a single fixed window.
alter table users add column if not exists failed_login_count int not null default 0;
alter table users add column if not exists locked_until timestamptz;
alter table users add column if not exists lockout_count int not null default 0;
