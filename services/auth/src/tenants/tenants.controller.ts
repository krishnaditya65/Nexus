import { Controller, Get, Body, Delete, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { KmsProvider } from '@nexus/kms';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { TenantsService } from './tenants.service';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Post()
  async create(@Body() body: { name: string; slug: string }) {
    return this.tenants.create(body.name, body.slug);
  }

  /**
   * Deliberately unauthenticated — this is a pre-login lookup, the same
   * category as SSO's /sso/:tenantSlug/login. Supports subdomain-based
   * tenant routing: a frontend hosted at `{subdomain}.<baseDomain>` reads
   * `window.location.hostname`, takes the leftmost label as the subdomain,
   * and calls this to find out (a) whether that workspace exists at all —
   * so it can render a clean "workspace not found" page instead of a raw
   * 404/500 — and (b) its display name, for branding the login screen
   * before the visitor has authenticated.
   *
   * Returns only non-sensitive, already-public-by-design fields (mirrors
   * `tenants.slug` being unique and shown in every login URL already).
   * IMPORTANT: this endpoint is a UX convenience, not a security boundary —
   * the subdomain itself proves nothing about which tenant a request may
   * act on. That's still enforced downstream by the tenant_id claim in the
   * JWT plus Postgres FORCE ROW LEVEL SECURITY (see each service's db/pool.ts),
   * which check the authenticated caller's actual tenant, not whatever
   * hostname they happened to browse to.
   */
  @Get('resolve/:subdomain')
  async resolveBySubdomain(@Param('subdomain') subdomain: string) {
    const tenant = await this.tenants.findBySlug(subdomain);
    if (!tenant) {
      throw new NotFoundException(`no workspace registered at subdomain '${subdomain}'`);
    }
    return { slug: tenant.slug, displayName: tenant.name };
  }

  // ---- IP allowlisting (docs/FEATURES.md §11.1) — own-tenant only,
  // scoped off req.user.tenant_id from the caller's own verified JWT,
  // never a path param, so no caller can manage another tenant's list.

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('ip-allowlist')
  addIpAllowlistEntry(@Req() req: any, @Body() body: { cidr: string; description?: string }) {
    return this.tenants.addIpAllowlistEntry(req.user.tenant_id, body.cidr, body.description ?? '');
  }

  @UseGuards(JwtAuthGuard)
  @Get('ip-allowlist')
  listIpAllowlist(@Req() req: any) {
    return this.tenants.listIpAllowlist(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete('ip-allowlist/:id')
  removeIpAllowlistEntry(@Req() req: any, @Param('id') id: string) {
    return this.tenants.removeIpAllowlistEntry(req.user.tenant_id, id);
  }

  // ---- Sub-tenant isolation (docs/FEATURES.md §11.1) — own-tenant only,
  // scoped off the caller's own verified JWT, same as IP allowlisting
  // above. The actual cross-division access-token minting lives on
  // AuthController (POST /auth/sub-tenants/:id/access) since it needs
  // AuthService's JwtService/SessionsService, which TenantsModule can't
  // depend on without a circular import (AuthModule already imports
  // TenantsModule).

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('sub-tenants')
  createSubTenant(@Req() req: any, @Body() body: { name: string; slug: string }) {
    return this.tenants.createSubTenant(req.user.tenant_id, body.name, body.slug);
  }

  @UseGuards(JwtAuthGuard)
  @Get('sub-tenants')
  listSubTenants(@Req() req: any) {
    return this.tenants.listSubTenants(req.user.tenant_id);
  }

  // ---- Platform-enforced 2FA policy (docs/FEATURES.md §13.8) — owner
  // only, same tier as every other tenant-wide security posture toggle
  // (IP allowlisting above). AuthService.login() is where this actually
  // gets enforced — see its docblock for the enrollment-token mechanism
  // and its disclosed scope.

  @UseGuards(JwtAuthGuard)
  @Get('mfa-required')
  getMfaRequired(@Req() req: any) {
    return this.tenants.getMfaRequired(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('mfa-required')
  setMfaRequired(@Req() req: any, @Body() body: { required: boolean }) {
    return this.tenants.setMfaRequired(req.user.tenant_id, !!body.required);
  }

  // ---- Geo-based access restriction (docs/FEATURES.md §11.1) — owner
  // only to write, same tier as every other tenant-wide security posture
  // toggle. AuthService.login() is where this is actually enforced.

  @UseGuards(JwtAuthGuard)
  @Get('geo-restrictions')
  getGeoRestrictions(@Req() req: any) {
    return this.tenants.getGeoRestrictions(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('geo-restrictions')
  setGeoRestrictions(@Req() req: any, @Body() body: { countries: string[] }) {
    return this.tenants.setGeoRestrictions(req.user.tenant_id, body.countries ?? []);
  }

  // ---- Device fingerprinting + "new device" challenge (§11.1) — opt-in. ----

  @UseGuards(JwtAuthGuard)
  @Get('device-challenge-required')
  getDeviceChallengeRequired(@Req() req: any) {
    return this.tenants.getDeviceChallengeRequired(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('device-challenge-required')
  setDeviceChallengeRequired(@Req() req: any, @Body() body: { required: boolean }) {
    return this.tenants.setDeviceChallengeRequired(req.user.tenant_id, !!body.required);
  }

  // ---- BYOK — customer-managed KMS keys (§11.1) — owner only to write.
  // See TenantsService.setKmsKeyConfig's docblock for the disclosed scope
  // (config surface is real; the actual cloud KMS API calls are not).

  @UseGuards(JwtAuthGuard)
  @Get('kms-key')
  getKmsKeyConfig(@Req() req: any) {
    return this.tenants.getKmsKeyConfig(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('kms-key')
  setKmsKeyConfig(@Req() req: any, @Body() body: { provider: KmsProvider; keyReference: string }) {
    return this.tenants.setKmsKeyConfig(req.user.tenant_id, body.provider, body.keyReference ?? '');
  }
}
