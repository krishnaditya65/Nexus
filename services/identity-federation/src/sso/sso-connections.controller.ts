import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SsoConnectionsService } from './sso-connections.service';

/** Admin configuration surface — a tenant admin wires up their IdP (Okta,
 *  Entra ID, Google Workspace) here. JWT-guarded like any other admin route. */
@UseGuards(JwtAuthGuard)
@Controller('sso-connections')
export class SsoConnectionsController {
  constructor(private readonly connections: SsoConnectionsService) {}

  @Post('oidc')
  async upsertOidc(
    @Req() req: any,
    @Body()
    body: {
      tenantSlug: string;
      providerLabel: string;
      issuerUrl: string;
      clientId: string;
      clientSecret: string;
    },
  ) {
    return this.connections.upsertOidc({
      tenantId: req.user.tenant_id,
      tenantSlug: body.tenantSlug,
      providerLabel: body.providerLabel,
      issuerUrl: body.issuerUrl,
      clientId: body.clientId,
      clientSecret: body.clientSecret,
    });
  }

  @Post('saml')
  async upsertSaml(
    @Req() req: any,
    @Body()
    body: {
      tenantSlug: string;
      providerLabel: string;
      idpMetadataXml: string;
      spEntityId?: string;
    },
  ) {
    return this.connections.upsertSaml({
      tenantId: req.user.tenant_id,
      tenantSlug: body.tenantSlug,
      providerLabel: body.providerLabel,
      idpMetadataXml: body.idpMetadataXml,
      spEntityId: body.spEntityId,
    });
  }
}
