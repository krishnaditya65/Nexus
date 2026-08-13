-- IP allowlisting per tenant (docs/FEATURES.md §11.1) — an empty
-- allowlist means unrestricted (fail-open on unconfigured, the same
-- stance RolesGuard already uses for @Roles-less routes elsewhere in
-- this platform); any entries present switch the tenant into
-- allowlist-enforced mode, checked at login time against the request's
-- client IP.
create table if not exists tenant_ip_allowlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  cidr text not null, -- a bare IP ("203.0.113.9") or CIDR range ("203.0.113.0/24")
  description text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists idx_tenant_ip_allowlist_tenant on tenant_ip_allowlist (tenant_id);
