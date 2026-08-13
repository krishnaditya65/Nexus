import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

/**
 * DR backup/restore automation for the 'tickets' data class
 * (docs/FEATURES.md §11.1/§0 — closing the "nothing automates taking or
 * restoring a backup against the DR policy registry's targets" gap).
 * `services/compliance` owns the policy/schedule/history; this service
 * owns the actual data, so it owns the actual export/restore-verify
 * logic — same "each service owns its own data" split as retention
 * purge (comms) and SIEM audit-log reads (auth).
 */
@Injectable()
export class BackupService {
  /** A real, row-level, tenant-scoped export — NOT `pg_dump` (which
   *  operates at whole-table/schema granularity, wrong for a shared
   *  multi-tenant table where RLS is what actually separates tenants).
   *  This is the correct backup unit for this platform's architecture:
   *  every row belonging to one tenant, exported as JSON. */
  async exportTickets(tenantId: string): Promise<{ rows: any[]; rowCount: number }> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from tickets where tenant_id = $1 order by ticket_number`, [tenantId]);
      return { rows, rowCount: rows.length };
    });
  }

  /**
   * Restore VERIFICATION, not a live restore — proves the backup file is
   * actually restorable (every row's real columns satisfy the real table
   * schema's constraints) without ever touching live ticket data. Creates
   * a uniquely-named staging table shaped exactly like `tickets`,
   * `COPY`s the exported rows into it, counts them, and drops it — the
   * same "an untested backup isn't a real guarantee" reasoning this
   * platform's `last_verified_restore_at` field already existed to
   * capture, now backed by an actual restore attempt instead of a
   * manually-stamped timestamp.
   */
  async verifyRestore(tenantId: string, rows: any[]): Promise<{ verified: boolean; rowCount: number; error?: string }> {
    // Table name built from a timestamp + random suffix, never user input
    // — nothing in this identifier is attacker-controlled.
    const stagingTable = `backup_verify_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    try {
      return await withTenant(tenantId, async (client) => {
        // LIKE ... INCLUDING ALL copies columns/defaults/CHECK
        // constraints/indexes but deliberately NOT foreign keys (Postgres
        // never copies those via LIKE) — a restore-verify must succeed
        // even if a referenced project/workflow-state row was itself
        // since deleted; that's a real, separate data-integrity question,
        // not what "is this backup file restorable" is asking.
        await client.query(`create temporary table ${stagingTable} (like tickets including all) on commit drop`);

        let inserted = 0;
        for (const row of rows) {
          await client.query(
            `insert into ${stagingTable}
               (id, tenant_id, project_id, ticket_number, type, title, description, state_id, assignee_user_id,
                parent_ticket_id, custom_fields, created_at, updated_at)
             values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
            [
              row.id, row.tenant_id, row.project_id, row.ticket_number, row.type, row.title, row.description,
              row.state_id, row.assignee_user_id, row.parent_ticket_id, JSON.stringify(row.custom_fields ?? {}),
              row.created_at, row.updated_at,
            ],
          );
          inserted++;
        }

        const { rows: countRows } = await client.query(`select count(*)::int as count from ${stagingTable}`);
        // withTenant COMMITs after this returns — the staging table's
        // ON COMMIT DROP then removes it automatically; real `tickets`
        // is never written to at any point in this method.
        return { verified: countRows[0].count === rows.length, rowCount: inserted };
      });
    } catch (err: any) {
      return { verified: false, rowCount: 0, error: err.message };
    }
  }
}
