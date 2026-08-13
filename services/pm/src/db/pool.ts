// Tenant-scoped Postgres pool + withTenant() transaction helper. Runtime connects as eos_app (never the eos owner/superuser) so FORCE ROW LEVEL SECURITY (set on every table in migrations/) actually applies — see docs/ARCHITECTURE.md's Multi-tenancy model.
import { Pool, PoolClient, types } from 'pg';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// pg's default DATE (oid 1082) parser returns a JS Date at LOCAL midnight,
// which then serializes back out via JSON as a UTC ISO timestamp shifted
// by the server's timezone offset — a real bug caught live shipping
// tickets.due_date (§12.1): saving "2026-08-20" round-tripped back as
// "2026-08-19T18:30:00.000Z" on this deployment's IST host. `due_date` is
// a plain calendar date with no time-of-day meaning, so the fix is to
// never construct a Date from it at all — keep the raw 'YYYY-MM-DD'
// string pg already sends over the wire untouched.
types.setTypeParser(1082, (value) => value);

// Runtime connects as eos_app — a non-superuser, non-owner role — so that
// `force row level security` (set on every tenant table in migrations/)
// actually applies. Never point this at the `eos` owner/superuser role;
// migrate.ts uses that role deliberately and separately.
export const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ??
    'postgres://eos_app:eos_app_dev_password@localhost:5432/eos_pm',
});

/**
 * Runs `fn` inside a transaction with `app.tenant_id` set via SET LOCAL,
 * so Postgres RLS enforces isolation even if a query forgets a WHERE clause.
 * Pass tenantId = null only for tenant-creation / cross-tenant admin paths.
 */
export async function withTenant<T>(
  tenantId: string | null,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    if (tenantId) {
      if (!UUID_RE.test(tenantId)) {
        throw new Error('Invalid tenantId format');
      }
      // SET LOCAL doesn't support parameterized values; tenantId is validated
      // as a strict UUID above, so string interpolation here is safe.
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
