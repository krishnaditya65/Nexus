-- BYOK — customer-managed KMS keys (docs/FEATURES.md §11.1). Tenant-level
-- config surface: which provider a tenant's secrets should be protected
-- under. 'platform_managed' (the default — every tenant starts here) means
-- @nexus/kms's own AES-256-GCM master key, already applied to every
-- plaintext-at-rest secret column this build had flagged
-- (identity-federation's OIDC client secret, compliance's SIEM auth
-- token). A tenant registering an external provider is a real, wired
-- config change — see @nexus/kms's byok.ts docblock for why the actual
-- AWS/Azure/GCP KMS API calls for that provider are a disclosed stub
-- (no cloud credentials available in this build) rather than a fake
-- success.
create table if not exists tenant_kms_keys (
  tenant_id uuid primary key,
  provider text not null default 'platform_managed'
    check (provider in ('platform_managed', 'aws_kms', 'azure_keyvault', 'gcp_kms')),
  key_reference text not null default '',  -- ARN / Key Vault URI / GCP resource name; empty for platform_managed
  registered_at timestamptz not null default now()
);
-- No RLS needed — same reasoning as `tenants` itself: this table is
-- keyed by tenant_id as its own primary key, read/written only through
-- own-tenant-scoped controller routes (req.user.tenant_id, never a path
-- param), the same "own-tenant only" discipline as IP allowlisting.
grant select, insert, update, delete on tenant_kms_keys to eos_app;
