import { Injectable } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';

@Injectable()
export class StatusPageService {
  async upsertComponent(tenantId: string, tenantSlug: string, name: string, status: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into status_components (tenant_id, tenant_slug, name, current_status)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, name) do update set current_status = excluded.current_status
         returning *`,
        [tenantId, tenantSlug, name, status],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from status_components where tenant_id = $1 order by name`, [
        tenantId,
      ]);
      return rows;
    });
  }

  /** Public — no JWT, no app.tenant_id. Goes through get_public_status_page
   *  (SECURITY DEFINER), same pattern as OIDC login / SCIM token lookup. */
  async getPublicStatusPage(tenantSlug: string) {
    const { rows } = await pool.query(`select * from get_public_status_page($1)`, [tenantSlug]);
    const overall = rows.some((r) => r.current_status !== 'operational') ? 'degraded' : 'operational';
    return { tenantSlug, overallStatus: overall, components: rows };
  }
}
