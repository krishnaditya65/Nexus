import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';
import { EmailService } from '../email/email.service';
import { DigestFrequency, isValidDigestFrequency, shouldSendDigest, buildDigestEmail } from './digest';

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(private readonly email: EmailService) {}

  async getFrequency(tenantId: string, userId: string): Promise<DigestFrequency> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select frequency from user_digest_settings where tenant_id = $1 and user_id = $2`,
        [tenantId, userId],
      );
      return (rows[0]?.frequency as DigestFrequency) ?? 'off';
    });
  }

  async setFrequency(tenantId: string, userId: string, frequency: string) {
    if (!isValidDigestFrequency(frequency)) {
      throw new BadRequestException(`frequency must be one of: off, daily, weekly`);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into user_digest_settings (tenant_id, user_id, frequency)
         values ($1, $2, $3)
         on conflict (tenant_id, user_id) do update set frequency = excluded.frequency, updated_at = now()
         returning *`,
        [tenantId, userId, frequency],
      );
      return rows[0];
    });
  }

  /**
   * Scheduler-facing half — called on a timer by this SAME service's
   * `SchedulerService` (no internal HTTP hop needed, unlike the
   * cross-service run-due calls elsewhere in this build, since digest
   * settings/deliveries and the scheduler all live in `services/
   * notifications` already). Same two-phase shape as every other run-due
   * method: a SECURITY DEFINER cross-tenant lookup, then a normal
   * tenant-scoped read/send/update per user.
   */
  async runDue(): Promise<{ sent: number; skippedEmpty: number; failed: number }> {
    const { rows: due } = await pool.query(`select * from list_users_due_for_digest()`);
    let sent = 0;
    let skippedEmpty = 0;
    let failed = 0;

    for (const row of due) {
      try {
        // Fetch and (if anything was sent) advance the cursor inside the
        // SAME withTenant transaction — a separate second call would leave
        // a window where deliveries created between the two calls are
        // silently skipped forever.
        const { deliveries } = await withTenant(row.tenant_id, async (client) => {
          const { rows } = await client.query(
            `select title, body, category, created_at
             from notification_deliveries
             where tenant_id = $1 and user_id = $2
               and ($3::timestamptz is null or created_at > $3)
             order by created_at desc
             limit 50`,
            [row.tenant_id, row.user_id, row.last_sent_at],
          );
          const mapped = rows.map((r) => ({
            title: r.title as string,
            body: r.body as string,
            category: r.category as string,
            createdAt: (r.created_at as Date).toISOString(),
          }));
          // The cursor must advance only to the newest row actually fetched
          // — never to now() — so anything beyond this 50-row page, or
          // created after the fetch, stays eligible for the next run.
          const newestCreatedAt = rows.length > 0 ? (rows[0].created_at as Date) : null;

          if (newestCreatedAt) {
            await client.query(
              `update user_digest_settings set last_sent_at = $3 where tenant_id = $1 and user_id = $2`,
              [row.tenant_id, row.user_id, newestCreatedAt],
            );
          }

          return { deliveries: mapped };
        });

        if (!shouldSendDigest(deliveries)) {
          skippedEmpty++;
          continue;
        }

        const { subject, body } = buildDigestEmail(row.frequency as DigestFrequency, deliveries);
        await this.email.sendToUser(row.tenant_id, row.user_id, subject, body);
        sent++;
      } catch (err: any) {
        // One user's misconfigured/failed digest never blocks the rest
        // of the batch — same per-row isolation as every other run-due
        // method in this build.
        this.logger.error(`digest failed for user ${row.user_id} (tenant ${row.tenant_id}): ${err.message}`);
        failed++;
      }
    }
    return { sent, skippedEmpty, failed };
  }
}
