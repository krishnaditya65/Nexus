import { BadRequestException, Injectable } from '@nestjs/common';
import { KmsProvider, isPlausibleKeyReference } from '@nexus/kms';
import { pool, withTenant } from '../db/pool';
import { matchesAny } from './ip-match.util';

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  parent_tenant_id: string | null;
  mfa_required: boolean;
  geo_allowed_countries: string[] | null;
  device_challenge_required: boolean;
  created_at: string;
}

@Injectable()
export class TenantsService {
  /** Tenant creation is cross-tenant by nature — runs without an app.tenant_id scope. */
  async create(name: string, slug: string): Promise<Tenant> {
    return withTenant(null, async (client) => {
      const { rows } = await client.query<Tenant>(
        `insert into tenants (name, slug) values ($1, $2) returning *`,
        [name, slug],
      );
      return rows[0];
    });
  }

  async findBySlug(slug: string): Promise<Tenant | null> {
    const { rows } = await pool.query<Tenant>(
      `select * from tenants where slug = $1`,
      [slug],
    );
    return rows[0] ?? null;
  }

  async findById(id: string): Promise<Tenant | null> {
    const { rows } = await pool.query<Tenant>(`select * from tenants where id = $1`, [id]);
    return rows[0] ?? null;
  }

  // ---- Sub-tenant isolation (docs/FEATURES.md §11.1) ----

  /** One level deep only — a sub-tenant cannot itself have sub-tenants.
   *  Checked here rather than as a DB constraint (Postgres can't see other
   *  rows in a CHECK), so every creation path goes through this guard. */
  async createSubTenant(parentTenantId: string, name: string, slug: string): Promise<Tenant> {
    const parent = await this.findById(parentTenantId);
    if (parent?.parent_tenant_id) {
      throw new BadRequestException('Sub-tenants cannot themselves have sub-tenants (one level deep only)');
    }
    return withTenant(null, async (client) => {
      const { rows } = await client.query<Tenant>(
        `insert into tenants (name, slug, parent_tenant_id) values ($1, $2, $3) returning *`,
        [name, slug, parentTenantId],
      );
      return rows[0];
    });
  }

  async listSubTenants(parentTenantId: string): Promise<Tenant[]> {
    const { rows } = await pool.query<Tenant>(
      `select * from tenants where parent_tenant_id = $1 order by created_at`,
      [parentTenantId],
    );
    return rows;
  }

  // ---- IP allowlisting (docs/FEATURES.md §11.1) ----
  // tenant_ip_allowlist isn't RLS-scoped (see its migration's docblock) —
  // same reasoning `tenants` itself has no RLS: every query here filters
  // by an explicit tenant_id parameter rather than relying on
  // app.tenant_id, since this table is read at login time, before any
  // JWT (and therefore any RLS session variable) exists.

  async addIpAllowlistEntry(tenantId: string, cidr: string, description: string) {
    const { rows } = await pool.query(
      `insert into tenant_ip_allowlist (tenant_id, cidr, description) values ($1, $2, $3) returning *`,
      [tenantId, cidr, description],
    );
    return rows[0];
  }

  async listIpAllowlist(tenantId: string) {
    const { rows } = await pool.query(
      `select * from tenant_ip_allowlist where tenant_id = $1 order by created_at desc`,
      [tenantId],
    );
    return rows;
  }

  async removeIpAllowlistEntry(tenantId: string, id: string) {
    const { rowCount } = await pool.query(`delete from tenant_ip_allowlist where id = $1 and tenant_id = $2`, [
      id,
      tenantId,
    ]);
    return { deleted: (rowCount ?? 0) > 0 };
  }

  /** Fail-open on an empty allowlist (no rows = unrestricted), same
   *  stance RolesGuard already takes for a route with no @Roles(...) —
   *  a tenant that never configured this shouldn't be locked out. */
  async isIpAllowed(tenantId: string, ip: string): Promise<boolean> {
    const entries = await this.listIpAllowlist(tenantId);
    if (entries.length === 0) return true;
    return matchesAny(ip, entries.map((e) => e.cidr));
  }

  // ---- Platform-enforced 2FA policy (docs/FEATURES.md §13.8) ----

  async getMfaRequired(tenantId: string): Promise<{ mfa_required: boolean }> {
    const tenant = await this.findById(tenantId);
    return { mfa_required: tenant?.mfa_required ?? false };
  }

  async setMfaRequired(tenantId: string, required: boolean): Promise<Tenant> {
    const { rows } = await pool.query<Tenant>(
      `update tenants set mfa_required = $1 where id = $2 returning *`,
      [required, tenantId],
    );
    return rows[0];
  }

  // ---- Geo-based access restriction (docs/FEATURES.md §11.1) ----
  // Same "own-tenant only, read/write pattern" as mfa-required above.

  async getGeoRestrictions(tenantId: string): Promise<{ countries: string[] }> {
    const tenant = await this.findById(tenantId);
    return { countries: tenant?.geo_allowed_countries ?? [] };
  }

  async setGeoRestrictions(tenantId: string, countries: string[]): Promise<Tenant> {
    const { rows } = await pool.query<Tenant>(
      `update tenants set geo_allowed_countries = $1 where id = $2 returning *`,
      [countries.length > 0 ? countries : null, tenantId],
    );
    return rows[0];
  }

  // ---- Device fingerprinting + "new device" login challenge
  // (docs/FEATURES.md §11.1) — opt-in, same pattern as mfa_required. ----

  async getDeviceChallengeRequired(tenantId: string): Promise<{ required: boolean }> {
    const tenant = await this.findById(tenantId);
    return { required: tenant?.device_challenge_required ?? false };
  }

  // ---- BYOK — customer-managed KMS keys (docs/FEATURES.md §11.1) ----

  async getKmsKeyConfig(tenantId: string): Promise<{ provider: KmsProvider; keyReference: string; registeredAt: string | null }> {
    const { rows } = await pool.query(`select * from tenant_kms_keys where tenant_id = $1`, [tenantId]);
    if (!rows[0]) return { provider: 'platform_managed', keyReference: '', registeredAt: null };
    return { provider: rows[0].provider, keyReference: rows[0].key_reference, registeredAt: rows[0].registered_at };
  }

  /** Real config write, honestly-scoped: registering a non-platform
   *  provider here does NOT yet make encrypt/decrypt actually route
   *  through that provider's API anywhere in this build (see
   *  @nexus/kms's byok.ts docblock for why) — this stores the intent and
   *  validates the key reference looks plausible for its provider, ahead
   *  of the real cloud-SDK wiring landing as a fast-follow. */
  async setKmsKeyConfig(tenantId: string, provider: KmsProvider, keyReference: string) {
    if (!isPlausibleKeyReference(provider, keyReference)) {
      throw new BadRequestException(`"${keyReference}" doesn't look like a valid ${provider} key reference`);
    }
    const { rows } = await pool.query(
      `insert into tenant_kms_keys (tenant_id, provider, key_reference)
       values ($1, $2, $3)
       on conflict (tenant_id) do update set provider = excluded.provider, key_reference = excluded.key_reference, registered_at = now()
       returning *`,
      [tenantId, provider, keyReference],
    );
    return rows[0];
  }

  async setDeviceChallengeRequired(tenantId: string, required: boolean): Promise<Tenant> {
    const { rows } = await pool.query<Tenant>(
      `update tenants set device_challenge_required = $1 where id = $2 returning *`,
      [required, tenantId],
    );
    return rows[0];
  }
}
