import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { resolveMasterKey, decryptSecret } from '@nexus/kms';
import { SsoConnectionsService } from './sso-connections.service';
import { isOidcLoginStateExpired } from './oidc-state';

const masterKey = resolveMasterKey(process.env.EOS_KMS_MASTER_KEY);

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

/**
 * Minimal OIDC Authorization Code flow — enough to federate login against
 * any standards-compliant IdP (Okta, Entra ID, Google Workspace all publish
 * a discovery document at {issuer}/.well-known/openid-configuration).
 * Deliberately not using a full OIDC client library here so every step of
 * the trust chain (discovery -> auth redirect -> code exchange -> userinfo
 * -> platform provisioning) stays legible in one place.
 */
@Injectable()
export class OidcLoginService {
  // In-memory state store — fine for a single instance; move to Redis before
  // running more than one replica of this service.
  private readonly pendingLoginStates = new Map<string, { tenantSlug: string; createdAt: number }>();

  constructor(private readonly connections: SsoConnectionsService) {}

  private async discover(issuerUrl: string): Promise<OidcDiscoveryDocument> {
    const res = await fetch(`${issuerUrl.replace(/\/$/, '')}/.well-known/openid-configuration`);
    if (!res.ok) throw new Error(`OIDC discovery failed for ${issuerUrl}: ${res.status}`);
    return (await res.json()) as OidcDiscoveryDocument;
  }

  /** Prunes expired pending states on every new login attempt — bounds
   *  the in-memory map's growth without needing a separate timer/cron
   *  (this service has none). Cheap: O(pending logins in flight), which
   *  in practice is small and short-lived. */
  private prunePendingStates() {
    const now = Date.now();
    for (const [state, pending] of this.pendingLoginStates) {
      if (isOidcLoginStateExpired(pending.createdAt, now)) {
        this.pendingLoginStates.delete(state);
      }
    }
  }

  async buildAuthorizationRedirectUrl(tenantSlug: string, selfBaseUrl: string): Promise<string> {
    this.prunePendingStates();
    const connection = await this.connections.findEnabledOidcByTenantSlug(tenantSlug);
    if (!connection) throw new NotFoundException('No OIDC SSO connection configured for this tenant');

    const discovery = await this.discover(connection.oidc_issuer_url!);
    const state = randomBytes(16).toString('hex');
    this.pendingLoginStates.set(state, { tenantSlug, createdAt: Date.now() });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: connection.oidc_client_id!,
      redirect_uri: `${selfBaseUrl}/sso/callback`,
      scope: 'openid email profile',
      state,
    });
    return `${discovery.authorization_endpoint}?${params.toString()}`;
  }

  async completeLogin(code: string, state: string, selfBaseUrl: string) {
    const pending = this.pendingLoginStates.get(state);
    if (!pending) throw new NotFoundException('Unknown or expired SSO login state');
    this.pendingLoginStates.delete(state);
    // Real bug fix (see oidc-state.ts's docblock) — a state generated but
    // never completed previously stayed valid in memory forever; now it's
    // rejected past a bounded TTL, same as it would be if the map were
    // ever swapped for Redis with a real expiry.
    if (isOidcLoginStateExpired(pending.createdAt, Date.now())) {
      throw new UnauthorizedException('SSO login state expired — please sign in again');
    }

    const connection = await this.connections.getConnectionForTokenExchange(pending.tenantSlug);
    if (!connection) throw new NotFoundException('SSO connection no longer configured');

    const discovery = await this.discover(connection.oidc_issuer_url);

    const tokenRes = await fetch(discovery.token_endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: `${selfBaseUrl}/sso/callback`,
        client_id: connection.oidc_client_id,
        // §11.1 — decrypted here, server-side only, right before the
        // one HTTP call that actually needs the plaintext value; never
        // logged, never returned to a browser.
        client_secret: decryptSecret(connection.oidc_client_secret_encrypted, masterKey),
      }),
    });
    if (!tokenRes.ok) {
      throw new Error(`OIDC token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
    }
    const { access_token: idpAccessToken } = (await tokenRes.json()) as { access_token: string };

    const userinfoRes = await fetch(discovery.userinfo_endpoint, {
      headers: { authorization: `Bearer ${idpAccessToken}` },
    });
    if (!userinfoRes.ok) {
      throw new Error(`OIDC userinfo fetch failed: ${userinfoRes.status}`);
    }
    const profile = (await userinfoRes.json()) as { email: string; name?: string };

    // Just-in-time provisioning: first successful SSO login creates the
    // platform user if one doesn't already exist, via the same internal
    // endpoint SCIM uses — one provisioning code path, two triggers.
    const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
    const upsertRes = await fetch(`${authServiceUrl}/internal/federation/upsert-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify({
        tenantSlug: pending.tenantSlug,
        email: profile.email,
        displayName: profile.name ?? profile.email,
      }),
    });
    if (!upsertRes.ok) {
      throw new Error(`platform provisioning failed: ${upsertRes.status}`);
    }
    return upsertRes.json() as Promise<{ userId: string; tenantId: string; accessToken: string }>;
  }
}
