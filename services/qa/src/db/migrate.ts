/** Forward-only migration runner — connects as the eos owner/superuser;
 *  runtime traffic (src/db/pool.ts) never uses this role. */
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.MIGRATION_DATABASE_URL ?? 'postgres://eos:eos_dev_password@localhost:5432/eos_qa',
});

async function main() {
  await pool.query(`
    create table if not exists schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);
  const dir = join(__dirname, '..', '..', 'migrations');
  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const { rows } = await pool.query(`select 1 from schema_migrations where filename = $1`, [file]);
    if (rows.length) {
      console.log(`skip (already applied): ${file}`);
      continue;
    }
    const sql = readFileSync(join(dir, file), 'utf8');
    console.log(`applying: ${file}`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query(`insert into schema_migrations (filename) values ($1)`, [file]);
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
