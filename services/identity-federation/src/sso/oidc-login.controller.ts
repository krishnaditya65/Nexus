import { Controller, Get, Param, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { OidcLoginService } from './oidc-login.service';
import { SsoConnectionsService } from './sso-connections.service';

/** Unauthenticated by design — this IS the login flow. */
@Controller('sso')
export class OidcLoginController {
  constructor(
    private readonly oidcLogin: OidcLoginService,
    private readonly connections: SsoConnectionsService,
  ) {}

  private selfBaseUrl() {
    return process.env.SELF_BASE_URL ?? 'http://localhost:4009';
  }

  /**
   * Pairs with auth-service's `GET /tenants/resolve/:subdomain` in the
   * subdomain-based login flow: once the frontend knows a workspace exists
   * at this subdomain, it calls this to decide whether to render a
   * password form or silently redirect straight into `:tenantSlug/login`
   * below. Unauthenticated for the same reason resolve/:subdomain is —
   * "does this tenant use SSO" is not itself sensitive, and the visitor
   * has no session yet to check it against.
   */
  @Get(':tenantSlug/available')
  async available(@Param('tenantSlug') tenantSlug: string) {
    const connection = await this.connections.findEnabledOidcByTenantSlug(tenantSlug);
    return connection
      ? { ssoEnabled: true, providerLabel: connection.provider_label }
      : { ssoEnabled: false };
  }

  @Get(':tenantSlug/login')
  async login(@Param('tenantSlug') tenantSlug: string, @Res() res: Response) {
    const redirectUrl = await this.oidcLogin.buildAuthorizationRedirectUrl(
      tenantSlug,
      this.selfBaseUrl(),
    );
    res.redirect(redirectUrl);
  }

  @Get('callback')
  async callback(
    @Query('code') code: string,
    @Query('state') state: string,
    @Res() res: Response,
  ) {
    const result = await this.oidcLogin.completeLogin(code, state, this.selfBaseUrl());
    // Real deployment: redirect to the web app with the token in a short-lived
    // cookie or fragment, not a query param. Kept as JSON here — the frontend
    // (⚪ not built yet) owns that exchange.
    res.json(result);
  }
}
