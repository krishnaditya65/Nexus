-- Sub-tenant isolation (docs/FEATURES.md §11.1): a master tenant can have
-- divisions, each fully isolated from the others.
--
-- The key insight this migration leans on: every service in this platform
-- already scopes ALL data access strictly by `tenant_id` under
-- FORCE ROW LEVEL SECURITY (see docs/ARCHITECTURE.md). A "division" that is
-- simply its own ordinary tenant row therefore gets full, real data
-- isolation from its siblings and its parent for free, across all 17
-- services, without touching a single RLS policy anywhere — division data
-- literally cannot leak because nothing about RLS enforcement changes.
--
-- What's actually new here is narrow: (1) a parent/child link so a division
-- can be listed/managed from its master tenant, and (2) a governed way for
-- a master-tenant owner to access a division's data without a separate
-- password for every division (see AuthService.accessSubTenant) — audited
-- in BOTH tenants' own audit_log chains, capped at 'admin' (never 'owner')
-- in the division so a bridging login can't itself create/delete the
-- division or rewire its SSO config.
alter table tenants add column if not exists parent_tenant_id uuid references tenants(id);
create index if not exists idx_tenants_parent on tenants(parent_tenant_id);

-- A tenant cannot be its own parent, and (for this build) sub-tenants are
-- one level deep only — a division cannot itself have divisions. Enforced
-- in TenantsService.createSubTenant, not the database, since Postgres check
-- constraints can't see other rows; documented here so the invariant is
-- discoverable from the schema, not just the application code.
