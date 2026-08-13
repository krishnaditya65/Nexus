-- Device fingerprinting + "new device" login challenge (docs/FEATURES.md
-- §11.1). "Fingerprinting" here is a persistent client-generated device
-- id (a random UUID the frontend creates once and stores in
-- localStorage), not passive browser fingerprinting (canvas/font/screen
-- enumeration) — a deliberately simpler, more reliable, and less
-- privacy-invasive mechanism than real passive fingerprinting, and the
-- same "device id cookie" approach most real products use for "remember
-- this device." Only a SHA-256 hash of the client-supplied id is ever
-- stored — the raw id itself is meaningless without knowing which user
-- it's paired with, and the hash means this table's rows are never
-- directly usable to re-identify a device across users/tenants.
-- Opt-in, owner-configurable — same "off by default, tenant explicitly
-- turns it on" stance as mfa_required and geo_allowed_countries (both
-- 012_geo_restrictions.sql). Defaulting this to ON platform-wide would
-- be a breaking UX change sprung on every existing tenant's users with
-- no way to opt out; that's a materially different design decision than
-- "ship the mechanism, let an owner decide," which is what every other
-- login-time security toggle in this build does.
alter table tenants add column if not exists device_challenge_required boolean not null default false;

create table if not exists known_devices (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  device_id_hash text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (user_id, device_id_hash)
);
alter table known_devices enable row level security;
alter table known_devices force row level security;
create policy tenant_isolation_known_devices on known_devices
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Same "opaque server-side challenge id, not a real JWT" shape as
-- mfa_challenges (see MfaService's docblock for why) — a short-lived
-- email-code verification a brand-new device must pass before it's
-- trusted.
create table if not exists device_challenges (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  user_id uuid not null,
  device_id_hash text not null,
  code_hash text not null,
  expires_at timestamptz not null
);
alter table device_challenges enable row level security;
alter table device_challenges force row level security;
create policy tenant_isolation_device_challenges on device_challenges
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
