-- Platform-enforced 2FA policy (docs/FEATURES.md §13.8) — an owner-level
-- toggle requiring MFA for every user in the tenant, not just self-service
-- opt-in. TOTP (002_mfa.sql) and WebAuthn (007_webauthn.sql) both already
-- exist per-user; nothing enforced adoption tenant-wide until this.
alter table tenants add column if not exists mfa_required boolean not null default false;
