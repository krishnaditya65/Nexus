// Tenant-scoped Postgres pool + withTenant() transaction helper. Runtime connects as eos_app (never the eos owner/superuser) so FORCE ROW LEVEL SECURITY (set on every table in migrations/) actually applies — see docs/ARCHITECTURE.md's Multi-tenancy model.
import { Pool, PoolClient } from 'pg';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ?? 'postgres://eos_app:eos_app_dev_password@localhost:5432/eos_artifacts',
});

export async function withTenant<T>(tenantId: string, fn: (client: PoolClient) => Promise<T>): Promise<T> {
  if (!UUID_RE.test(tenantId)) {
    throw new Error('Invalid tenantId format');
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SET LOCAL app.tenant_id = '${tenantId}'`);
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
