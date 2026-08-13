import { Body, Controller, Delete, Get, Param, Post, Put, Req, UseGuards } from '@nestjs/common';
import { ScimTokenGuard } from './scim-token.guard';
import { ScimUsersService } from './scim-users.service';

/**
 * SCIM 2.0 User endpoints (RFC 7644), minimal profile: enough for Okta/Entra
 * ID's SCIM app to provision, update, and deactivate users automatically.
 * Full filter-query and PATCH-op-list support is intentionally out of scope
 * for this pass — see docs/FEATURES.md.
 */
@UseGuards(ScimTokenGuard)
@Controller('scim/v2/Users')
export class ScimUsersController {
  constructor(private readonly scimUsers: ScimUsersService) {}

  @Get()
  async list(@Req() req: any) {
    const users = await this.scimUsers.list(req.scimTenant.tenantId);
    return {
      schemas: ['urn:ietf:params:scim:api:messages:2.0:ListResponse'],
      totalResults: users.length,
      Resources: users.map(toScimResource),
    };
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() body: { externalId: string; userName: string; displayName: string },
  ) {
    const user = await this.scimUsers.create(
      req.scimTenant.tenantId,
      req.scimTenant.tenantSlug,
      body.externalId,
      body.userName,
      body.displayName,
    );
    return toScimResource(user);
  }

  @Get(':externalId')
  async get(@Req() req: any, @Param('externalId') externalId: string) {
    const user = await this.scimUsers.findByExternalId(req.scimTenant.tenantId, externalId);
    return user ? toScimResource(user) : { schemas: [], detail: 'not found' };
  }

  @Put(':externalId')
  async replace(
    @Req() req: any,
    @Param('externalId') externalId: string,
    @Body() body: { userName: string; displayName: string },
  ) {
    const user = await this.scimUsers.create(
      req.scimTenant.tenantId,
      req.scimTenant.tenantSlug,
      externalId,
      body.userName,
      body.displayName,
    );
    return toScimResource(user);
  }

  @Delete(':externalId')
  async deactivate(@Req() req: any, @Param('externalId') externalId: string) {
    const user = await this.scimUsers.deactivate(req.scimTenant.tenantId, externalId);
    return user ? toScimResource(user) : { schemas: [], detail: 'not found' };
  }
}

function toScimResource(user: {
  id: string;
  external_id: string;
  email: string;
  display_name: string;
  active: boolean;
}) {
  return {
    schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'],
    id: user.id,
    externalId: user.external_id,
    userName: user.email,
    displayName: user.display_name,
    active: user.active,
  };
}
