import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';
import { QueriesService } from '../queries/queries.service';

const CADENCES = ['hourly', 'daily', 'weekly'] as const;
export type Cadence = (typeof CADENCES)[number];

const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * Scheduled JQL/filter subscriptions (docs/FEATURES.md §13.3) — a saved
 * query, run on a cadence, emailed to the subscriber. This is the
 * user-facing CRUD half; `runDue()` below is the scheduler-facing half
 * that `services/notifications`'s new cron job calls into via
 * `POST /internal/subscriptions/run-due`.
 */
@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private readonly queries: QueriesService) {}

  async create(
    tenantId: string,
    userId: string,
    input: { queryId: string; projectId: string; cadence: Cadence },
  ) {
    if (!CADENCES.includes(input.cadence)) {
      throw new BadRequestException(`cadence must be one of [${CADENCES.join(', ')}]`);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into saved_query_subscriptions (tenant_id, query_id, project_id, user_id, cadence)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, input.queryId, input.projectId, userId, input.cadence],
      );
      return rows[0];
    });
  }

  async listForUser(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select s.*, q.name as query_name
         from saved_query_subscriptions s
         join saved_queries q on q.id = s.query_id
         where s.tenant_id = $1 and s.user_id = $2
         order by s.created_at desc`,
        [tenantId, userId],
      );
      return rows;
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select user_id from saved_query_subscriptions where id = $1`, [id]);
      if (!rows[0]) throw new NotFoundException('Subscription not found');
      if (rows[0].user_id !== userId) throw new BadRequestException('Only the subscriber can remove their own subscription');
      await client.query(`delete from saved_query_subscriptions where id = $1`, [id]);
      return { status: 'removed' };
    });
  }

  /**
   * The scheduler-facing half — called on a timer by
   * services/notifications's SchedulerService, never by an end user
   * directly. `list_due_subscriptions()` is a SECURITY DEFINER function
   * (022_saved_query_subscriptions.sql's docblock) — the one place in
   * this method that reads across every tenant at once; everything after
   * that per-row loop goes back through `withTenant(tenantId, ...)`, a
   * normal RLS-scoped connection, once the tenant is known.
   */
  async runDue(): Promise<{ ran: number; failed: number }> {
    const { rows: due } = await pool.query(`select * from list_due_subscriptions()`);
    let ran = 0;
    let failed = 0;
    for (const sub of due) {
      try {
        const results = await this.queries.executeSaved(sub.tenant_id, sub.query_id, sub.project_id);
        await withTenant(sub.tenant_id, async (client) => {
          await client.query(`update saved_query_subscriptions set last_run_at = now() where id = $1`, [sub.id]);
        });
        await this.sendDigestEmail(sub.tenant_id, sub.user_id, results.length, sub.query_id);
        ran++;
      } catch (err: any) {
        // One tenant's misconfigured subscription (a deleted saved query,
        // say) never blocks the rest of the batch — same "don't fail the
        // whole run over one bad row" discipline as automations.service's
        // per-automation try/catch.
        this.logger.error(`Subscription ${sub.id} (tenant ${sub.tenant_id}) failed: ${err.message}`);
        failed++;
      }
    }
    return { ran, failed };
  }

  private async sendDigestEmail(tenantId: string, userId: string, resultCount: number, queryId: string) {
    try {
      await fetch(`${NOTIFICATIONS_URL}/internal/email/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({
          tenantId,
          userId,
          subject: `Your saved search has ${resultCount} matching ticket${resultCount === 1 ? '' : 's'}`,
          body: `Your subscribed saved search (query ${queryId}) currently matches ${resultCount} ticket(s). Open it in the app to review.`,
          category: 'query_subscription',
        }),
      });
    } catch (err: any) {
      // Same non-fatal-notification-failure pattern as automations.service's
      // notify() — a failed email delivery doesn't mark the subscription
      // run itself as failed (the query DID run, last_run_at DID advance).
      this.logger.warn(`Digest email failed for user ${userId}: ${err.message}`);
    }
  }
}
