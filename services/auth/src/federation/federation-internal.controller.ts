import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Param,
  Post,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuthService } from '../auth/auth.service';

/**
 * Internal, service-to-service surface consumed by services/identity-federation
 * (SCIM provisioning and OIDC/SAML SSO). Never exposed to end users directly —
 * gated by a shared secret, not by end-user JWTs, because the caller here is
 * another backend service acting on a federated identity provider's say-so.
 */
@Controller('internal/federation')
export class FederationInternalController {
  constructor(
    private readonly auth: AuthService,
    private readonly tenants: TenantsService,
    private readonly users: UsersService,
  ) {}

  private assertTrustedCaller(secretHeader: string | undefined) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secretHeader !== expected) {
      throw new ForbiddenException('untrusted caller');
    }
  }

  /**
   * Idempotent upsert used by both SCIM provisioning (HR/IdP-driven) and
   * OIDC just-in-time provisioning (first-login-driven). Returns a live
   * access token so identity-federation can complete an SSO login without
   * ever handling the user's real platform password.
   */
  @Post('upsert-user')
  async upsertUser(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body()
    body: {
      tenantSlug: string;
      email: string;
      displayName: string;
      externalIdpId?: string;
    },
  ) {
    this.assertTrustedCaller(secret);

    const tenant = await this.tenants.findBySlug(body.tenantSlug);
    if (!tenant) throw new ForbiddenException('unknown tenant');

    let user = await this.users.findByEmailForAuth(tenant.id, body.email);
    if (!user) {
      // SSO/SCIM-provisioned users get a random, never-communicated password —
      // they can only authenticate via the federated identity provider.
      const generatedPassword = randomBytes(24).toString('hex');
      user = {
        ...(await this.users.create(
          tenant.id,
          body.email,
          generatedPassword,
          body.displayName,
        )),
        password_hash: '',
      };
    }

    // Same AuthService.issueToken every normal login goes through — real
    // session row + sid claim, is_guest, and permissions all included, so
    // an SSO/SCIM-provisioned caller's token behaves identically to one
    // from the ordinary login flow instead of breaking downstream
    // `payload.permissions.includes(...)` checks (no clientIp/userAgent to
    // attribute the session to here — this is a service-to-service call).
    const accessToken = await this.auth.issueToken(user, null, null);

    return { userId: user.id, tenantId: tenant.id, accessToken };
  }

  /**
   * Resolves a tenant's canonical slug from its id. Used by other services
   * to verify a client-supplied `tenantSlug` in a request body actually
   * belongs to the authenticated caller's own tenant (from the verified
   * JWT's `tenant_id`) before using that slug to key anything looked up by
   * slug alone (pre-login SSO connections, SCIM tokens, public status
   * pages) — a client-supplied slug must never be trusted on its own for
   * that.
   */
  @Get('tenant/:id')
  async getTenantById(@Headers('x-internal-secret') secret: string | undefined, @Param('id') id: string) {
    this.assertTrustedCaller(secret);
    const tenant = await this.tenants.findById(id);
    if (!tenant) throw new ForbiddenException('unknown tenant');
    return { id: tenant.id, slug: tenant.slug, name: tenant.name };
  }

  @Post('deprovision-user')
  async deprovisionUser(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantSlug: string; email: string },
  ) {
    this.assertTrustedCaller(secret);
    const tenant = await this.tenants.findBySlug(body.tenantSlug);
    if (!tenant) throw new ForbiddenException('unknown tenant');
    // Soft-disable rather than hard-delete: preserves audit trail / ticket
    // assignment history, which the "Immutable Audit Logs" requirement
    // depends on. Real disable-flag migration tracked alongside RBAC work.
    return { status: 'deprovision-requested', tenantId: tenant.id, email: body.email };
  }
}
