import { Injectable } from '@nestjs/common';
import { randomBytes, createHash } from 'crypto';
import { pool, withTenant } from '../db/pool';

@Injectable()
export class ApiKeysService {
  async create(tenantId: string, name: string, scopes: string[]) {
    const rawKey = 'nexus_live_' + randomBytes(24).toString('hex');
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const keyPrefix = rawKey.slice(0, 16);

    const row = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into api_keys (tenant_id, name, key_hash, key_prefix, scopes)
         values ($1, $2, $3, $4, $5) returning id, name, key_prefix, scopes, created_at`,
        [tenantId, name, keyHash, keyPrefix, scopes],
      );
      return rows[0];
    });

    return { ...row, key: rawKey, warning: 'store this now — it will not be shown again' };
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, name, key_prefix, scopes, created_at, last_used_at, revoked_at
         from api_keys where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async revoke(tenantId: string, keyId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update api_keys set revoked_at = now() where id = $1 returning id, revoked_at`,
        [keyId],
      );
      return rows[0] ?? null;
    });
  }

  /** Pre-auth resolution used by ApiKeyGuard — goes through resolve_api_key
   *  (SECURITY DEFINER) since no app.tenant_id exists at this point. */
  async resolveByRawKey(rawKey: string) {
    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const { rows } = await pool.query(`select * from resolve_api_key($1)`, [keyHash]);
    const resolved = rows[0];
    if (resolved) {
      await withTenant(resolved.tenant_id, (client) =>
        client.query(`update api_keys set last_used_at = now() where id = $1`, [resolved.id]),
      );
    }
    return resolved ?? null;
  }
}
