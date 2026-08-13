import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { StatusPageService } from './status-page.service';

@Controller()
export class StatusPageController {
  constructor(private readonly statusPage: StatusPageService) {}

  @UseGuards(JwtAuthGuard)
  @Post('status-components')
  upsert(@Req() req: any, @Body() body: { tenantSlug: string; name: string; status: string }) {
    return this.statusPage.upsertComponent(req.user.tenant_id, body.tenantSlug, body.name, body.status);
  }

  @UseGuards(JwtAuthGuard)
  @Get('status-components')
  list(@Req() req: any) {
    return this.statusPage.list(req.user.tenant_id);
  }

  /** Unauthenticated by design — this IS the public status page. */
  @Get('status-page/:tenantSlug')
  publicPage(@Param('tenantSlug') tenantSlug: string) {
    return this.statusPage.getPublicStatusPage(tenantSlug);
  }
}
