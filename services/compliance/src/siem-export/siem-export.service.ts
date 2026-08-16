import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { resolveMasterKey, encryptSecret, decryptSecret } from '@nexus/kms';
import { pool, withTenant } from '../db/pool';

// SSRF guard for `endpointUrl` (§11.1) — this value is later `fetch()`'d
// carrying the tenant's decrypted SIEM auth token (see deliverAndStamp), so
// an unvalidated URL is both an SSRF and a secret-exfiltration primitive:
// an attacker configuring `endpointUrl: http://169.254.169.254/...` would
// have this service hand its own cloud-metadata endpoint (or any other
// internal service) a bearer token. No existing URL-validation helper
// elsewhere in this codebase — hand-rolled here with Node's built-in URL.
//
// This is a literal-hostname check only: it rejects the obvious
// loopback/link-local/private-IP literals a caller could type directly.
// It does NOT resolve hostnames at request time, so a DNS-rebinding attack
// (a hostname that resolves to a public IP at config time but a private
// one at fetch time) is not covered — that needs resolution-time
// enforcement (e.g. an egress network policy / DNS-pinning fetch agent),
// which is out of scope for this fix.
const PRIVATE_HOSTNAME_PATTERNS: RegExp[] = [
  /^localhost$/i,
  /^0\.0\.0\.0$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // loopback
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/, // RFC1918
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/, // RFC1918
  /^192\.168\.\d{1,3}\.\d{1,3}$/, // RFC1918
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // link-local, incl. 169.254.169.254 cloud metadata
  /^\[?::1\]?$/, // IPv6 loopback
];

function assertSafeEndpointUrl(endpointUrl: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpointUrl);
  } catch {
    throw new BadRequestException('endpointUrl must be a valid absolute URL');
  }
  if (parsed.protocol !== 'https:') {
    throw new BadRequestException('endpointUrl must use https:');
  }
  const hostname = parsed.hostname;
  if (PRIVATE_HOSTNAME_PATTERNS.some((pattern) => pattern.test(hostname))) {
    throw new BadRequestException('endpointUrl may not point at a loopback, link-local, or private-network host');
  }
}

const AUTH_SERVICE_URL = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
// BYOK/secrets-management (docs/FEATURES.md §11.1) — `auth_token_encrypted`
// used to be plaintext-at-rest despite its name; now real AES-256-GCM
// envelope encryption via @nexus/kms.
const masterKey = resolveMasterKey(process.env.EOS_KMS_MASTER_KEY);

@Injectable()
export class SiemExportService {
  private readonly logger = new Logger(SiemExportService.name);

  async upsertConfig(
    tenantId: string,
    destination: 'splunk' | 'datadog',
    endpointUrl: string,
    authToken: string,
  ) {
    assertSafeEndpointUrl(endpointUrl);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into siem_export_configs (tenant_id, destination, endpoint_url, auth_token_encrypted)
         values ($1, $2, $3, $4)
         on conflict (tenant_id, destination) do update
           set endpoint_url = excluded.endpoint_url, auth_token_encrypted = excluded.auth_token_encrypted
         returning id, tenant_id, destination, endpoint_url, is_enabled, last_exported_at, created_at`,
        [tenantId, destination, endpointUrl, encryptSecret(authToken, masterKey)],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, tenant_id, destination, endpoint_url, is_enabled, last_exported_at, created_at
         from siem_export_configs where tenant_id = $1`,
        [tenantId],
      );
      return rows;
    });
  }

  /** User-driven manual trigger — uses the CALLER's own authorization
   *  header to read services/auth's audit-log (that endpoint is
   *  JwtAuthGuard-gated, appropriately, for a human-initiated call). */
  async triggerExportNow(tenantId: string, destination: 'splunk' | 'datadog', authorizationHeader: string) {
    const config = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from siem_export_configs where tenant_id = $1 and destination = $2 and is_enabled = true`,
        [tenantId, destination],
      );
      return rows[0] ?? null;
    });
    if (!config) return { status: 'no-config' };

    const events = await this.fetchAuditEvents(tenantId, { authorization: authorizationHeader });
    if (events === null) {
      this.logger.warn(`audit-log read failed — SIEM export deferred`);
      return { status: 'deferred', reason: 'auth-service /audit-log call failed' };
    }
    return this.deliverAndStamp(tenantId, destination, config, events);
  }

  /**
   * SIEM export delivery WORKER (docs/FEATURES.md §11.1) — the actual
   * scheduled half; `triggerExportNow` above was always a manual, one-off
   * trigger, never something that ran on its own. Called by
   * `services/notifications`'s `SchedulerService` on a cron tick (same
   * infra §13.3 built for saved-query subscriptions — one scheduler,
   * multiple consumers, not reinvented per-feature). Cross-tenant
   * config listing goes through a `SECURITY DEFINER` function
   * (`list_enabled_siem_exports()`, 004_siem_export_worker.sql's
   * docblock — same reasoning as pm's `list_due_subscriptions()`); each
   * row's actual export then runs through a normal per-tenant
   * `withTenant(tenantId, ...)` connection.
   *
   * Uses the new internal, `x-internal-secret`-gated
   * `GET /audit-log/internal` (services/auth) instead of a user's
   * authorization header — there is no end-user request for a cron tick
   * to borrow one from.
   */
  async runDue(): Promise<{ ran: number; failed: number; deferred: number }> {
    const { rows: due } = await pool.query(`select * from list_enabled_siem_exports()`);
    let ran = 0;
    let failed = 0;
    let deferred = 0;
    for (const row of due) {
      try {
        const config = await withTenant(row.tenant_id, async (client) => {
          const { rows } = await client.query(`select * from siem_export_configs where id = $1`, [row.id]);
          return rows[0] ?? null;
        });
        if (!config) continue;

        const events = await this.fetchAuditEvents(row.tenant_id, { 'x-internal-secret': INTERNAL_SECRET });
        if (events === null) {
          deferred++;
          continue;
        }
        const result = await this.deliverAndStamp(row.tenant_id, row.destination, config, events);
        if (result.status === 'exported') ran++;
        else failed++;
      } catch (err: any) {
        // One tenant's misconfigured/unreachable SIEM endpoint never
        // blocks the rest of the batch — same per-row try/catch
        // discipline as pm's SubscriptionsService.runDue().
        this.logger.error(`SIEM export tick failed for config ${row.id} (tenant ${row.tenant_id}): ${err.message}`);
        failed++;
      }
    }
    return { ran, failed, deferred };
  }

  private async fetchAuditEvents(tenantId: string, extraHeaders: Record<string, string>): Promise<unknown[] | null> {
    try {
      const url = extraHeaders['x-internal-secret']
        ? `${AUTH_SERVICE_URL}/audit-log/internal?tenantId=${tenantId}`
        : `${AUTH_SERVICE_URL}/audit-log`;
      const res = await fetch(url, { headers: extraHeaders });
      if (!res.ok) return null;
      const body = await res.json();
      return Array.isArray(body) ? body : [];
    } catch {
      return null;
    }
  }

  private async deliverAndStamp(
    tenantId: string,
    destination: string,
    config: { endpoint_url: string; auth_token_encrypted: string },
    events: unknown[],
  ) {
    try {
      await fetch(config.endpoint_url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          // §11.1 — decrypted here, right before the one outbound call
          // that needs the plaintext value; never logged, never returned
          // to any API response (list() above never selects this column).
          authorization: `Bearer ${decryptSecret(config.auth_token_encrypted, masterKey)}`,
        },
        body: JSON.stringify({ source: 'nexus', events }),
      });
      await withTenant(tenantId, (client) =>
        client.query(
          `update siem_export_configs set last_exported_at = now() where tenant_id = $1 and destination = $2`,
          [tenantId, destination],
        ),
      );
      return { status: 'exported' as const };
    } catch (err) {
      this.logger.error(`SIEM export to ${destination} failed: ${err}`);
      return { status: 'failed' as const, error: String(err) };
    }
  }
}
