import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { PERMISSIONS, RolesService } from './roles.service';

@Controller('roles')
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** The grantable-permission catalog — the frontend's role-builder form
   *  renders checkboxes off this rather than hardcoding the list a second
   *  time. Any authenticated user can read it (it's not sensitive, just a
   *  vocabulary list); only owners can actually create/edit a role below. */
  @UseGuards(JwtAuthGuard)
  @Get('permissions-catalog')
  permissionsCatalog() {
    return PERMISSIONS;
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any) {
    return this.roles.list(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post()
  create(@Req() req: any, @Body() body: { name: string; permissions: string[] }) {
    return this.roles.create(req.user.tenant_id, body.name, body.permissions ?? []);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: { name?: string; permissions?: string[] }) {
    return this.roles.update(req.user.tenant_id, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.roles.remove(req.user.tenant_id, id);
  }
}
