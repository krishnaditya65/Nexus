/* Minimal migration runner: applies migrations/*.sql in filename order,
 * tracked in a `schema_migrations` table. No down-migrations by design —
 * forward-only, matching how this platform will run in production. */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

// Deliberately NOT importing the runtime pool from ./pool — that connects as
// eos_app, which owns nothing and cannot CREATE TABLE. Migrations run as the
// `eos` owner/superuser so DDL and RLS policy definitions succeed; runtime
// traffic never uses this role.
const pool = new Pool({
  connectionString:
    process.env.MIGRATION_DATABASE_URL ??
    'postgres://eos:eos_dev_password@localhost:5432/eos_billing',
});

async function main() {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const dir = join(__dirname, '..', '..', 'migrations');
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const { rows } = await pool.query(
      `select 1 from schema_migrations where filename = $1`,
      [file],
    );
    if (rows.length) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const sql = readFileSync(join(dir, file), 'utf8');
    console.log(`applying: ${file}`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(
        `insert into schema_migrations (filename) values ($1)`,
        [file],
      );
      await pool.query('COMMIT');
    } catch (err) {
      await pool.query('ROLLBACK');
      throw err;
    }
  }

  await pool.end();
  console.log('migrations complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
