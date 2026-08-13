import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

interface UpsertPlatformUser {
  tenantSlug: string;
  email: string;
  displayName: string;
}

@Injectable()
export class ScimUsersService {
  constructor() {}

  private async provisionInAuthService(input: UpsertPlatformUser) {
    const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
    const res = await fetch(`${authServiceUrl}/internal/federation/upsert-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`auth-service upsert failed: ${res.status} ${await res.text()}`);
    }
    return res.json() as Promise<{ userId: string; tenantId: string }>;
  }

  async create(
    tenantId: string,
    tenantSlug: string,
    externalId: string,
    email: string,
    displayName: string,
  ) {
    const platform = await this.provisionInAuthService({ tenantSlug, email, displayName });
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into scim_users (tenant_id, external_id, email, display_name, platform_user_id)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, external_id) do update
           set email = excluded.email, display_name = excluded.display_name, updated_at = now()
         returning *`,
        [tenantId, externalId, email, displayName, platform.userId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from scim_users where tenant_id = $1 order by created_at`,
        [tenantId],
      );
      return rows;
    });
  }

  async findByExternalId(tenantId: string, externalId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from scim_users where tenant_id = $1 and external_id = $2`,
        [tenantId, externalId],
      );
      return rows[0] ?? null;
    });
  }

  /** SCIM DELETE = deactivate, matching how Okta/Entra actually behave (soft
   *  offboarding) — ties into the onboarding/offboarding orchestrator's
   *  license-reclaim step rather than deleting audit-relevant history. */
  async deactivate(tenantId: string, externalId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update scim_users set active = false, updated_at = now()
         where tenant_id = $1 and external_id = $2 returning *`,
        [tenantId, externalId],
      );
      return rows[0] ?? null;
    });
  }
}
