import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';
import { writeBackup, readBackup } from './storage';

const PM_SERVICE_URL = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * DR backup/restore automation (docs/FEATURES.md §11.1/§0) — the real
 * gap this closes: `backup_policies` (001_init.sql) always tracked
 * RPO/RTO targets and a `last_verified_restore_at` field as DATA;
 * nothing ever took a backup or attempted a restore against those
 * targets. `services/pm` owns `tickets`, so it owns the actual export/
 * restore-verify logic (see its `backup.service.ts`); this service
 * orchestrates — calling pm, storing the result, recording history.
 *
 * **Honest, explicit scope**: only the `tickets` data class is wired up
 * this pass — `git_repos`/`chat_history`/`financial_ledgers`/
 * `audit_logs` need their owning services to grow the same export/
 * restore-verify endpoint pair `services/pm` just did, same "one data
 * class fully real, the rest a disclosed fast-follow" scope as §11.10's
 * retention-purge work (chat_history only, there).
 */
@Injectable()
export class DrBackupService {
  private readonly logger = new Logger(DrBackupService.name);

  async takeTicketsBackup(tenantId: string) {
    const res = await fetch(`${PM_SERVICE_URL}/internal/backup/export-tickets?tenantId=${tenantId}`, {
      method: 'POST',
      headers: { 'x-internal-secret': INTERNAL_SECRET },
    });
    if (!res.ok) throw new BadRequestException(`backup export failed: ${res.status} ${await res.text()}`);
    const { rows, rowCount } = (await res.json()) as { rows: unknown[]; rowCount: number };

    const path = writeBackup(tenantId, 'tickets', Buffer.from(JSON.stringify(rows)));
    return withTenant(tenantId, async (client) => {
      const { rows: inserted } = await client.query(
        `insert into backup_runs (tenant_id, data_class, storage_path, row_count) values ($1, 'tickets', $2, $3) returning *`,
        [tenantId, path, rowCount],
      );
      return inserted[0];
    });
  }

  async listBackupRuns(tenantId: string, dataClass?: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        dataClass
          ? `select * from backup_runs where tenant_id = $1 and data_class = $2 order by taken_at desc`
          : `select * from backup_runs where tenant_id = $1 order by taken_at desc`,
        dataClass ? [tenantId, dataClass] : [tenantId],
      );
      return rows;
    });
  }

  /** Runs a REAL restore-verify against the most recent 'tickets' backup
   *  — a genuine end-to-end proof the stored file is actually restorable,
   *  not a manually-stamped "trust me" timestamp. Updates
   *  `backup_policies.last_verified_restore_at` only when the restore
   *  attempt genuinely succeeded. */
  async verifyLatestTicketsRestore(tenantId: string) {
    const latest = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from backup_runs where tenant_id = $1 and data_class = 'tickets' order by taken_at desc limit 1`,
        [tenantId],
      );
      return rows[0] ?? null;
    });
    if (!latest) throw new NotFoundException('No tickets backup exists yet — take one first');

    const blob = readBackup(latest.storage_path);
    if (!blob) throw new BadRequestException('Backup file is missing from storage — cannot verify');
    const rows = JSON.parse(blob.toString());

    const res = await fetch(`${PM_SERVICE_URL}/internal/backup/verify-restore-tickets`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
      body: JSON.stringify({ tenantId, rows }),
    });
    const result = (await res.json()) as { verified: boolean; rowCount: number; error?: string };

    return withTenant(tenantId, async (client) => {
      await client.query(
        `insert into restore_verifications (tenant_id, backup_run_id, succeeded, row_count_verified, error)
         values ($1, $2, $3, $4, $5)`,
        [tenantId, latest.id, result.verified, result.rowCount, result.error ?? null],
      );
      if (result.verified) {
        await client.query(
          `update backup_policies set last_verified_restore_at = now() where tenant_id = $1 and data_class = 'tickets'`,
          [tenantId],
        );
      }
      return result;
    });
  }

  /** Scheduler-facing half (docs/FEATURES.md §13.3's infra, third
   *  consumer after subscriptions and SIEM exports) — cross-tenant
   *  listing via a SECURITY DEFINER function
   *  (`list_tenants_with_ticket_backup_policy()`), same pattern as the
   *  other two. Runs a backup for every tenant with a 'tickets' policy
   *  configured, regardless of its configured frequency — there's no
   *  per-policy "next due at" timestamp tracked yet (same "no cadence
   *  field, run it every tick" simplification §11.1's SIEM export worker
   *  made for its own config surface). */
  async runDueBackups(): Promise<{ ran: number; failed: number }> {
    const { rows: tenants } = await pool.query(`select * from list_tenants_with_ticket_backup_policy()`);
    let ran = 0;
    let failed = 0;
    for (const row of tenants) {
      try {
        await this.takeTicketsBackup(row.tenant_id);
        ran++;
      } catch (err: any) {
        this.logger.error(`Backup tick failed for tenant ${row.tenant_id}: ${err.message}`);
        failed++;
      }
    }
    return { ran, failed };
  }
}
