-- identity-federation schema: SSO (SAML2/OIDC) connections + SCIM provisioning.
-- This service never stores platform passwords — it only brokers identity
-- from external IdPs into services/auth via the internal upsert-user API.

create extension if not exists "pgcrypto";

create table if not exists sso_connections (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tenant_slug text not null,       -- denormalized to avoid a cross-service join on every login
  protocol text not null,          -- 'oidc' | 'saml2'
  provider_label text not null,    -- 'Okta', 'Entra ID', 'Google Workspace', ...
  oidc_issuer_url text,
  oidc_client_id text,
  oidc_client_secret_encrypted text,  -- 🟡 plaintext-at-rest for now; BYOK/KMS envelope encryption pending
  saml_idp_metadata_xml text,
  saml_sp_entity_id text,
  is_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, protocol)
);

alter table sso_connections enable row level security;
alter table sso_connections force row level security;
create policy tenant_isolation_sso_connections on sso_connections
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- SCIM bearer tokens — one per tenant per IdP integration (Okta/Entra SCIM apps
-- issue and rotate these; the IdP presents this token on every SCIM call).
create table if not exists scim_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  tenant_slug text not null,
  token_hash text not null,       -- sha256(token) — raw token shown once at creation, never stored
  label text not null default 'default',
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

alter table scim_tokens enable row level security;
alter table scim_tokens force row level security;
create policy tenant_isolation_scim_tokens on scim_tokens
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- SCIM calls resolve their tenant FROM this token, so app.tenant_id can't be
-- set before this lookup runs — same pre-auth chicken-and-egg as the OIDC
-- login lookup below, same fix: a narrow SECURITY DEFINER function instead
-- of a raw, RLS-blocked SELECT.
create or replace function public.resolve_scim_token(p_token_hash text)
returns table (tenant_id uuid, tenant_slug text)
language sql
security definer
set search_path = public
as $$
  select tenant_id, tenant_slug from scim_tokens
  where token_hash = p_token_hash and revoked_at is null
  limit 1;
$$;

grant execute on function public.resolve_scim_token(text) to eos_app;

-- Mirror of provisioned identities, keyed by the IdP's own externalId, so
-- SCIM PATCH/DELETE requests (which address users by externalId, not email)
-- resolve deterministically.
create table if not exists scim_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  external_id text not null,       -- IdP-assigned SCIM id
  email text not null,
  display_name text not null,
  active boolean not null default true,
  platform_user_id uuid,           -- FK into services/auth's users table (cross-service, not enforced here)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

alter table scim_users enable row level security;
alter table scim_users force row level security;
create policy tenant_isolation_scim_users on scim_users
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists scim_groups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  external_id text not null,
  display_name text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

alter table scim_groups enable row level security;
alter table scim_groups force row level security;
create policy tenant_isolation_scim_groups on scim_groups
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists scim_group_members (
  group_id uuid not null references scim_groups(id) on delete cascade,
  scim_user_id uuid not null references scim_users(id) on delete cascade,
  tenant_id uuid not null,
  primary key (group_id, scim_user_id)
);

alter table scim_group_members enable row level security;
alter table scim_group_members force row level security;
create policy tenant_isolation_scim_group_members on scim_group_members
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Pre-login SSO lookup: the browser hits /sso/:tenantSlug/login before any
-- JWT exists, so app.tenant_id can never be set for that request — under
-- FORCE ROW LEVEL SECURITY a plain SELECT as eos_app would just return zero
-- rows. SECURITY DEFINER functions run as their owner (eos), which bypasses
-- RLS deliberately and only for these two narrow, explicit read shapes.
create or replace function public.lookup_enabled_oidc_login(p_tenant_slug text)
returns table (
  tenant_id uuid,
  tenant_slug text,
  provider_label text,
  oidc_issuer_url text,
  oidc_client_id text
)
language sql
security definer
set search_path = public
as $$
  select tenant_id, tenant_slug, provider_label, oidc_issuer_url, oidc_client_id
  from sso_connections
  where tenant_slug = p_tenant_slug and protocol = 'oidc' and is_enabled = true
  limit 1;
$$;

-- Same shape but includes the client secret — used only server-side by the
-- OIDC callback's authorization-code exchange, never by an HTTP handler that
-- returns its result to the browser.
create or replace function public.get_oidc_connection_for_token_exchange(p_tenant_slug text)
returns table (
  tenant_id uuid,
  oidc_issuer_url text,
  oidc_client_id text,
  oidc_client_secret_encrypted text
)
language sql
security definer
set search_path = public
as $$
  select tenant_id, oidc_issuer_url, oidc_client_id, oidc_client_secret_encrypted
  from sso_connections
  where tenant_slug = p_tenant_slug and protocol = 'oidc' and is_enabled = true
  limit 1;
$$;

grant execute on function public.lookup_enabled_oidc_login(text) to eos_app;
grant execute on function public.get_oidc_connection_for_token_exchange(text) to eos_app;

-- Runtime app role (eos_app) — least privilege, RLS-enforced via `force`
-- above. Applies to this migration's tables now and any future ones in this
-- service's database, so later migrations don't need to repeat this block.
grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
