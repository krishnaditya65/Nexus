-- WebAuthn/FIDO2 (docs/FEATURES.md §11.1). A second, phishing-resistant
-- MFA method alongside TOTP (see mfa/mfa.service.ts) — a user can enroll
-- any number of authenticators (security keys, platform authenticators
-- like Touch ID/Windows Hello) and use any one of them at login time
-- instead of a TOTP/recovery code. Enrolling a credential does NOT set
-- users.mfa_enabled by itself: mfa_enabled continues to mean "this
-- account requires a second factor at login" and stays governed by the
-- existing TOTP enrollment flow (or is flipped on here directly if a
-- user enrolls a passkey and has no TOTP secret — see webauthn.service.ts).

create table if not exists webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null, -- base64url-encoded COSE public key
  counter bigint not null default 0,
  device_type text not null, -- 'singleDevice' | 'multiDevice' (from simplewebauthn's credentialDeviceType)
  backed_up boolean not null default false,
  transports text[] not null default '{}',
  nickname text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

alter table webauthn_credentials enable row level security;
alter table webauthn_credentials force row level security;
create policy tenant_isolation_webauthn_credentials on webauthn_credentials
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_webauthn_credentials_user on webauthn_credentials (tenant_id, user_id);

-- The login-time assertion ceremony reuses the same opaque challenge row
-- an in-flight TOTP login already creates (mfa_challenges) — same id,
-- same expiry, same single-use-by-delete semantics — rather than
-- inventing a second parallel "which challenge is this" concept. This
-- column holds the actual WebAuthn challenge bytes (base64url) once a
-- client asks for authentication options.
alter table mfa_challenges add column if not exists webauthn_challenge text;

-- Registering a NEW credential happens from an already-authenticated
-- session (Settings > Security), which has no pre-existing challenge row
-- to reuse, so it gets its own short-lived table.
create table if not exists webauthn_registration_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null references users(id) on delete cascade,
  challenge text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

alter table webauthn_registration_challenges enable row level security;
alter table webauthn_registration_challenges force row level security;
create policy tenant_isolation_webauthn_registration_challenges on webauthn_registration_challenges
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant select, insert, update, delete on webauthn_credentials, webauthn_registration_challenges to eos_app;
