import { ForbiddenException } from '@nestjs/common';

/**
 * Verifies a client-supplied `tenantSlug` actually belongs to the
 * authenticated caller's own tenant (`tenantId`, from the verified JWT's
 * `tenant_id` claim), by resolving the real slug server-side via
 * services/auth's internal federation surface — same fetch-with-shared-
 * secret pattern used elsewhere in this service (see
 * `incidents.service.ts`'s call to notifications).
 *
 * `tenantId` is trustworthy (it comes from the verified JWT); a body's
 * `tenantSlug` is not. The public status page is looked up by slug alone
 * (`get_public_status_page`, no app.tenant_id) — an unverified slug would
 * let an authenticated admin of tenant A plant components under tenant B's
 * public status page.
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
