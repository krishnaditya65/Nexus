import { Injectable, Logger } from '@nestjs/common';
import { randomBytes, createHash, createHmac } from 'crypto';
import { withTenant } from '../db/pool';

// Pulled out as a standalone, exported, pure function so the actual
// signature computation is unit-testable without a database. See
// webhooks.service.spec.ts.
export function computeWebhookSignature(secretHash: string, body: string): string {
  return createHmac('sha256', secretHash).update(body).digest('hex');
}

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  async subscribe(tenantId: string, targetUrl: string, eventTypes: string[]) {
    const signingSecret = 'whsec_' + randomBytes(24).toString('hex');
    const secretHash = createHash('sha256').update(signingSecret).digest('hex');

    const row = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into webhook_subscriptions (tenant_id, target_url, event_types, signing_secret_hash)
         values ($1, $2, $3, $4) returning id, target_url, event_types, is_enabled, created_at`,
        [tenantId, targetUrl, eventTypes, secretHash],
      );
      return rows[0];
    });

    return { ...row, signingSecret, warning: 'store this now — used to verify X-Nexus-Signature, not shown again' };
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, target_url, event_types, is_enabled, created_at
         from webhook_subscriptions where tenant_id = $1`,
        [tenantId],
      );
      return rows;
    });
  }

  /**
   * Called by other services (pm, git-host, cicd, ...) when a billable/
   * notifiable domain event happens — "ticket.created", "pull_request.merged",
   * etc. Fans out to every matching, enabled subscription and delivers
   * synchronously with an HMAC-SHA256 signature, recording the outcome.
   * A retry queue (exponential backoff for failed deliveries) is the natural
   * next step once delivery volume justifies it over immediate-attempt.
   */
  async publishEvent(tenantId: string, eventType: string, payload: Record<string, unknown>) {
    const subscriptions = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from webhook_subscriptions
         where tenant_id = $1 and is_enabled = true and $2 = any(event_types)`,
        [tenantId, eventType],
      );
      return rows;
    });

    const results = [];
    for (const sub of subscriptions) {
      results.push(await this.attemptDelivery(tenantId, sub, eventType, payload));
    }
    return { matchedSubscriptions: subscriptions.length, results };
  }

  private async attemptDelivery(
    tenantId: string,
    subscription: { id: string; target_url: string; signing_secret_hash: string },
    eventType: string,
    payload: Record<string, unknown>,
  ) {
    const body = JSON.stringify({ eventType, payload, deliveredAt: new Date().toISOString() });
    // Note: we HMAC with the stored hash, not the raw secret (raw secret was
    // never persisted, matching the API-key/token pattern used elsewhere in
    // this platform) — subscribers verify against the same hash out-of-band
    // if they want a true shared-secret HMAC; documented limitation, see
    // docs/FEATURES.md for the real fix (store the secret via BYOK/KMS
    // envelope encryption instead of a one-way hash).
    const signature = computeWebhookSignature(subscription.signing_secret_hash, body);

    const deliveryId = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into webhook_deliveries (tenant_id, subscription_id, event_type, payload)
         values ($1, $2, $3, $4) returning id`,
        [tenantId, subscription.id, eventType, JSON.stringify(payload)],
      );
      return rows[0].id;
    });

    try {
      const res = await fetch(subscription.target_url, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-nexus-signature': signature },
        body,
      });
      await withTenant(tenantId, (client) =>
        client.query(
          `update webhook_deliveries
           set status = $2, attempt_count = attempt_count + 1, response_status = $3, last_attempted_at = now()
           where id = $1`,
          [deliveryId, res.ok ? 'delivered' : 'failed', res.status],
        ),
      );
      return { deliveryId, status: res.ok ? 'delivered' : 'failed', responseStatus: res.status };
    } catch (err) {
      this.logger.error(`webhook delivery ${deliveryId} to ${subscription.target_url} failed: ${err}`);
      await withTenant(tenantId, (client) =>
        client.query(
          `update webhook_deliveries
           set status = 'failed', attempt_count = attempt_count + 1, last_attempted_at = now()
           where id = $1`,
          [deliveryId],
        ),
      );
      return { deliveryId, status: 'failed', error: String(err) };
    }
  }
}
