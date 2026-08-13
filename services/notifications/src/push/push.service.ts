import { Injectable, Logger } from '@nestjs/common';
import * as webpush from 'web-push';
import { withTenant } from '../db/pool';
import { decidePushDeliveryStatus } from './push-status';
import { PreferencesService } from '../preferences/preferences.service';
import { isValidNotificationCategory } from '../preferences/preferences';

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private readonly preferences: PreferencesService) {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    const privateKey = process.env.VAPID_PRIVATE_KEY;
    if (publicKey && privateKey) {
      webpush.setVapidDetails(
        process.env.VAPID_SUBJECT ?? 'mailto:ops@nexus.local',
        publicKey,
        privateKey,
      );
    } else {
      this.logger.warn(
        'VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY not set — push sends will fail until configured. ' +
          'Generate a pair with `npx web-push generate-vapid-keys`.',
      );
    }
  }

  async subscribe(
    tenantId: string,
    userId: string,
    endpoint: string,
    p256dhKey: string,
    authKey: string,
    userAgent?: string,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into push_subscriptions (tenant_id, user_id, endpoint, p256dh_key, auth_key, user_agent)
         values ($1, $2, $3, $4, $5, $6)
         on conflict (tenant_id, user_id, endpoint) do update set p256dh_key = excluded.p256dh_key, auth_key = excluded.auth_key
         returning *`,
        [tenantId, userId, endpoint, p256dhKey, authKey, userAgent ?? null],
      );
      return rows[0];
    });
  }

  async unsubscribe(tenantId: string, userId: string, endpoint: string) {
    return withTenant(tenantId, async (client) => {
      await client.query(
        `delete from push_subscriptions where tenant_id = $1 and user_id = $2 and endpoint = $3`,
        [tenantId, userId, endpoint],
      );
      return { status: 'unsubscribed' };
    });
  }

  /**
   * Fans a notification out to every device a user has subscribed on. This
   * is the paging primitive: incident-management calls this for on-call
   * pages, pm calls it for @mentions/approval requests — one delivery
   * mechanism, many callers, each recorded for delivery-audit purposes.
   *
   * `projectId` (docs/FEATURES.md §12.6, optional — a caller with no
   * natural project, like a new-device login challenge, omits it) is
   * checked against `PreferencesService.isEnabled` BEFORE any real send
   * is attempted. A muted category short-circuits straight to a
   * `'muted'` delivery record — still visible in the recipient's inbox
   * (same "an unsent thing shouldn't be invisible" reasoning as
   * `'no_subscription'`), just never actually pushed to a device. An
   * unrecognized category is treated as always-enabled rather than
   * thrown on — this is the platform's own internal fan-out call, not
   * user input, and a typo'd category here should degrade to "deliver
   * it" not "silently drop it."
   */
  async sendToUser(
    tenantId: string,
    userId: string,
    title: string,
    body: string,
    category: string,
    projectId: string | null = null,
  ) {
    if (isValidNotificationCategory(category)) {
      const enabled = await this.preferences.isEnabled(tenantId, userId, category, projectId);
      if (!enabled) {
        await withTenant(tenantId, (client) =>
          client.query(
            `insert into notification_deliveries (tenant_id, user_id, title, body, category, status)
             values ($1, $2, $3, $4, $5, 'muted')`,
            [tenantId, userId, title, body, category],
          ),
        );
        return { status: 'muted' as const, subscriptionCount: 0 };
      }
    }

    const subscriptions = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from push_subscriptions where tenant_id = $1 and user_id = $2`,
        [tenantId, userId],
      );
      return rows;
    });

    let anyFailed = false;
    for (const sub of subscriptions) {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh_key, auth: sub.auth_key },
          },
          JSON.stringify({ title, body, category }),
        );
      } catch (err) {
        this.logger.error(`push send to ${sub.endpoint} failed: ${err}`);
        anyFailed = true;
      }
    }
    const status = decidePushDeliveryStatus(subscriptions.length, anyFailed);

    await withTenant(tenantId, (client) =>
      client.query(
        `insert into notification_deliveries (tenant_id, user_id, title, body, category, status)
         values ($1, $2, $3, $4, $5, $6)`,
        [tenantId, userId, title, body, category, status],
      ),
    );

    return { status, subscriptionCount: subscriptions.length };
  }

  // --- Inbox (§12.6) — a real per-user feed over the same deliveries
  // row every push send already wrote, whether or not a device was
  // subscribed to actually receive it as a push. ---

  async listForUser(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from notification_deliveries where tenant_id = $1 and user_id = $2
         order by created_at desc limit 100`,
        [tenantId, userId],
      );
      return rows;
    });
  }

  async unreadCount(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select count(*)::int as count from notification_deliveries
         where tenant_id = $1 and user_id = $2 and read_at is null`,
        [tenantId, userId],
      );
      return { count: rows[0].count };
    });
  }

  /** Self-service only — no `WHERE user_id = $2` bypass, so a user can
   *  only ever mark their OWN deliveries read, same "you manage your own"
   *  scoping as auth's session revocation. */
  async markRead(tenantId: string, userId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update notification_deliveries set read_at = now()
         where id = $1 and tenant_id = $2 and user_id = $3 and read_at is null
         returning *`,
        [id, tenantId, userId],
      );
      return rows[0] ?? null;
    });
  }

  async markAllRead(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(
        `update notification_deliveries set read_at = now()
         where tenant_id = $1 and user_id = $2 and read_at is null`,
        [tenantId, userId],
      );
      return { markedRead: rowCount };
    });
  }
}
