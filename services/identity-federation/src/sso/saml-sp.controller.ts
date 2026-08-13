import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import type { Response } from 'express';
import { SamlSpService } from './saml-sp.service';

/** Unauthenticated by design, same as OidcLoginController — this IS the
 *  login flow, and the ACS endpoint is where the IdP POSTs to from outside
 *  our origin, so it can never carry our own session cookie/JWT. */
@Controller('sso/saml')
export class SamlSpController {
  constructor(private readonly saml: SamlSpService) {}

  @Get(':tenantSlug/metadata')
  async metadata(@Param('tenantSlug') tenantSlug: string, @Res() res: Response) {
    const xml = await this.saml.spMetadataXml(tenantSlug);
    res.setHeader('content-type', 'application/xml');
    res.send(xml);
  }

  @Get(':tenantSlug/login')
  async login(@Param('tenantSlug') tenantSlug: string, @Res() res: Response) {
    const redirectUrl = await this.saml.buildLoginRedirectUrl(tenantSlug);
    res.redirect(redirectUrl);
  }

  /** IdP posts the SAMLResponse here as `application/x-www-form-urlencoded`
   *  (HTTP-POST binding, SAML 2.0 §3.5). NestJS's default body parser
   *  handles that the same as JSON, so `@Body()` just works. */
  @Post(':tenantSlug/acs')
  async acs(
    @Param('tenantSlug') tenantSlug: string,
    @Body() body: Record<string, string>,
    @Res() res: Response,
  ) {
    const { email, displayName, nameId } = await this.saml.processAcs(tenantSlug, body);

    const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
    const upsertRes = await fetch(`${authServiceUrl}/internal/federation/upsert-user`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
      },
      body: JSON.stringify({ tenantSlug, email, displayName, externalIdpId: nameId }),
    });
    if (!upsertRes.ok) {
      throw new Error(`platform provisioning failed: ${upsertRes.status}`);
    }
    // Same disclosed scope note as OidcLoginController.callback: real
    // deployment redirects into the web app with a short-lived cookie, not
    // JSON. The frontend's SAML landing page (⚪ not built — SP-initiated
    // SAML is admin-configured/IdP-dashboard-launched, no platform login
    // button to wire up yet) owns that exchange.
    res.json(await upsertRes.json());
  }
}
