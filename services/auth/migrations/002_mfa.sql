-- TOTP-based MFA (docs/FEATURES.md §11.1 "TOTP-based MFA") — a user's
-- secret is stored only once verified (mfa_secret null + mfa_enabled
-- false until the enrollment flow's first correct code confirms the
-- authenticator app is actually set up correctly). Recovery codes are
-- stored hashed (bcrypt, same as the password itself), never plaintext,
-- and each is single-use (consumed_at set on use).

alter table users add column if not exists mfa_secret text;
alter table users add column if not exists mfa_enabled boolean not null default false;

create table if not exists mfa_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  code_hash text not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

alter table mfa_recovery_codes enable row level security;
alter table mfa_recovery_codes force row level security;
create policy tenant_isolation_mfa_recovery_codes on mfa_recovery_codes
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_mfa_recovery_codes_user on mfa_recovery_codes (user_id);

-- Opaque, short-lived, server-side-only login challenges — see
-- mfa.service.ts's docblock for why this is deliberately NOT a JWT
-- signed by the platform's real key. Consumed (deleted) on successful
-- verify, so it's single-use by construction, not just by convention.
create table if not exists mfa_challenges (
  id uuid primary key,
  tenant_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table mfa_challenges enable row level security;
alter table mfa_challenges force row level security;
create policy tenant_isolation_mfa_challenges on mfa_challenges
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update, delete on mfa_recovery_codes, mfa_challenges to eos_app;
