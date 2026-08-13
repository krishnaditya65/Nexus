import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CatalogService } from './catalog.service';

@Controller()
export class CatalogController {
  constructor(private readonly catalog: CatalogService) {}

  @Get('plans')
  listPlans() {
    return this.catalog.listPlans();
  }

  // Committing/cancelling a subscription is a financial decision on behalf
  // of the whole tenant — restricted the same way project creation is in
  // pm-service, not left to any authenticated member.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('subscriptions')
  subscribe(@Req() req: any, @Body() body: { planCode: string; seatCount: number }) {
    return this.catalog.subscribe(req.user.tenant_id, body.planCode, body.seatCount);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions')
  get(@Req() req: any) {
    return this.catalog.getSubscription(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('subscriptions/cancel')
  cancel(@Req() req: any) {
    return this.catalog.cancel(req.user.tenant_id);
  }
}
