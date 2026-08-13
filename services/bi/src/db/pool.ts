/** Tenant-scoped Postgres access for services/bi. Runtime connects as
 *  eos_app, never the eos owner/superuser — see docs/ARCHITECTURE.md's
 *  Multi-tenancy model. */
import { Pool, PoolClient } from 'pg';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://eos_app:eos_app_dev_password@localhost:5432/eos_bi',
});

export async function withTenant<T>(tenantId: string | null, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      if (!UUID_RE.test(tenantId)) throw new Error('Invalid tenantId format');
      await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
    }
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
