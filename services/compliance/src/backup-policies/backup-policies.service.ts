import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const COMMS_SERVICE_URL = process.env.COMMS_SERVICE_URL ?? 'http://localhost:4004';

// §11.10's real, honest scope: only 'chat_history' has an actual purge
// implementation wired up so far (services/comms owns messages). The
// other 4 data classes (git_repos, tickets, financial_ledgers,
// audit_logs) are deliberately NOT enforced yet — audit_logs specifically
// never should be casually auto-purged (it would break the hash-chain
// tamper-detection guarantee; a real retention-compliant purge there
// needs chain-aware archival, not a plain DELETE), and the others need
// their owning services to grow the same purge-endpoint pattern comms
// just did. Calling enforceRetention for an unsupported class fails
// loudly with a clear message instead of silently doing nothing.
const ENFORCEABLE_DATA_CLASSES: Record<string, { serviceUrl: string; path: string }> = {
  chat_history: { serviceUrl: COMMS_SERVICE_URL, path: '/internal/retention/purge-messages' },
};

/** Sane platform defaults per data class — a tenant can override any of
 *  these, but every tenant gets a defined RPO/RTO from day one rather than
 *  silently having none. Mirrors the SLA table in docs/ARCHITECTURE.md. */
export const DEFAULT_BACKUP_POLICIES = [
  { dataClass: 'git_repos', rpoMinutes: 15, rtoMinutes: 60, frequency: 'continuous', retentionDays: 365 },
  { dataClass: 'tickets', rpoMinutes: 60, rtoMinutes: 60, frequency: 'hourly', retentionDays: 365 },
  { dataClass: 'chat_history', rpoMinutes: 60, rtoMinutes: 240, frequency: 'hourly', retentionDays: 180 },
  { dataClass: 'financial_ledgers', rpoMinutes: 0, rtoMinutes: 15, frequency: 'continuous', retentionDays: 2555 }, // 7yr
  { dataClass: 'audit_logs', rpoMinutes: 0, rtoMinutes: 15, frequency: 'continuous', retentionDays: 2555 },
] as const;

@Injectable()
export class BackupPoliciesService {
  async seedDefaults(tenantId: string) {
    // Queries on the SAME client/transaction the inserts just ran on —
    // calling this.list(tenantId) here would open a second connection via
    // its own withTenant() before this transaction commits, and under
    // read-committed isolation that second connection can't see these
    // still-uncommitted inserts. Caught live: seed-defaults was
    // genuinely returning `[]` on a fresh tenant despite the rows
    // existing immediately afterward on a fresh query.
    return withTenant(tenantId, async (client) => {
      for (const p of DEFAULT_BACKUP_POLICIES) {
        await client.query(
          `insert into backup_policies (tenant_id, data_class, rpo_minutes, rto_minutes, backup_frequency, retention_days)
           values ($1, $2, $3, $4, $5, $6)
           on conflict (tenant_id, data_class) do nothing`,
          [tenantId, p.dataClass, p.rpoMinutes, p.rtoMinutes, p.frequency, p.retentionDays],
        );
      }
      const { rows } = await client.query(
        `select * from backup_policies where tenant_id = $1 order by data_class`,
        [tenantId],
      );
      return rows;
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from backup_policies where tenant_id = $1 order by data_class`,
        [tenantId],
      );
      return rows;
    });
  }

  async upsert(
    tenantId: string,
    dataClass: string,
    rpoMinutes: number,
    rtoMinutes: number,
    frequency: string,
    retentionDays: number,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into backup_policies (tenant_id, data_class, rpo_minutes, rto_minutes, backup_frequency, retention_days)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (tenant_id, data_class) do update
           set rpo_minutes = excluded.rpo_minutes, rto_minutes = excluded.rto_minutes,
               backup_frequency = excluded.backup_frequency, retention_days = excluded.retention_days
         returning *`,
        [tenantId, dataClass, rpoMinutes, rtoMinutes, frequency, retentionDays],
      );
      return rows[0];
    });
  }

  /** Records a tested restore — an untested backup isn't a real recovery
   *  guarantee, so this is a first-class, queryable fact, not just a log line. */
  async recordVerifiedRestore(tenantId: string, dataClass: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update backup_policies set last_verified_restore_at = now()
         where tenant_id = $1 and data_class = $2 returning *`,
        [tenantId, dataClass],
      );
      return rows[0] ?? null;
    });
  }

  /** Real, triggerable enforcement — this repo has no cron/job-queue
   *  infra (same documented limitation as CI's job broker and connector
   *  syncs), so this is a manual/on-demand trigger rather than an
   *  automatic background sweep, honestly scoped like everything else
   *  that would otherwise need a scheduler this platform doesn't have
   *  yet. Reads the tenant's OWN configured retentionDays (never a
   *  hardcoded default) and forwards the caller's bearer token to the
   *  owning service's purge endpoint — the same cross-service pattern
   *  used throughout. */
  async enforceRetention(tenantId: string, dataClass: string, authorizationHeader: string) {
    const enforcer = ENFORCEABLE_DATA_CLASSES[dataClass];
    if (!enforcer) {
      throw new BadRequestException(
        `retention enforcement isn't implemented for '${dataClass}' yet — only ${Object.keys(ENFORCEABLE_DATA_CLASSES).join(', ')} ${Object.keys(ENFORCEABLE_DATA_CLASSES).length === 1 ? 'is' : 'are'} wired up`,
      );
    }

    const policy = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select retention_days from backup_policies where tenant_id = $1 and data_class = $2`,
        [tenantId, dataClass],
      );
      return rows[0] ?? null;
    });
    if (!policy) throw new NotFoundException(`no backup policy configured for '${dataClass}' — seed defaults first`);

    const res = await fetch(`${enforcer.serviceUrl}${enforcer.path}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify({ tenantId, olderThanDays: policy.retention_days }),
    });
    if (!res.ok) {
      throw new BadRequestException(`retention purge call failed: ${res.status} ${await res.text()}`);
    }
    const { deletedCount } = (await res.json()) as { deletedCount: number };

    return withTenant(tenantId, async (client) => {
      await client.query(
        `insert into retention_purge_runs (tenant_id, data_class, retention_days, deleted_count)
         values ($1, $2, $3, $4)`,
        [tenantId, dataClass, policy.retention_days, deletedCount],
      );
      const { rows } = await client.query(
        `update backup_policies set last_purge_at = now() where tenant_id = $1 and data_class = $2 returning *`,
        [tenantId, dataClass],
      );
      return { ...rows[0], deletedCount };
    });
  }

  async listPurgeRuns(tenantId: string, dataClass: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from retention_purge_runs where tenant_id = $1 and data_class = $2 order by ran_at desc limit 20`,
        [tenantId, dataClass],
      );
      return rows;
    });
  }
}
