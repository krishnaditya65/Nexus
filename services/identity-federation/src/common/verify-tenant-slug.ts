import { ForbiddenException } from '@nestjs/common';

/**
 * Verifies a client-supplied `tenantSlug` actually belongs to the
 * authenticated caller's own tenant (`tenantId`, from the verified JWT's
 * `tenant_id` claim), by resolving the real slug server-side via
 * services/auth's internal federation surface — same fetch-with-shared-
 * secret pattern as `scim-users.service.ts` / `oidc-login.service.ts`.
 *
 * `tenantId` is trustworthy (it comes from the verified JWT); a body's
 * `tenantSlug` is not. Endpoints that key connections/tokens by slug alone
 * (the pre-login SSO redirect, SCIM bearer-token lookup) must never accept
 * an unverified slug — otherwise an authenticated admin of tenant A could
 * plant a slug belonging to tenant B and hijack tenant B's pre-login flow.
 */
export async function verifyTenantSlug(tenantId: string, claimedSlug: string): Promise<void> {
  const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
  const res = await fetch(`${authServiceUrl}/internal/federation/tenant/${tenantId}`, {
    headers: {
      'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
    },
  });
  if (!res.ok) {
    throw new ForbiddenException('unable to verify tenant');
  }
  const tenant = (await res.json()) as { slug: string };
  if (tenant.slug !== claimedSlug) {
    throw new ForbiddenException('tenantSlug does not match the authenticated tenant');
  }
}
