import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { MeteringService } from './metering.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class MeteringController {
  constructor(private readonly metering: MeteringService) {}

  // Left ungated: this is how other services (cicd's ci_minutes, etc.)
  // report usage under the acting user's own request context, not an
  // admin-only action — see services/cicd/src/runs/runner.service.ts.
  @Post('usage-events')
  record(@Req() req: any, @Body() body: { metric: string; quantity: number; sourceService: string }) {
    return this.metering.recordUsage(req.user.tenant_id, body.metric, body.quantity, body.sourceService);
  }

  @Get('usage-events/summary')
  summary(@Req() req: any, @Query('metric') metric: string) {
    return this.metering.summarizeCurrentPeriod(req.user.tenant_id, metric);
  }

  // Raising/lowering a feature's usage cap for the whole tenant is a
  // billing-admin action, unlike reporting/reading usage above.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('entitlements')
  setEntitlement(@Req() req: any, @Body() body: { featureKey: string; limitValue: number }) {
    return this.metering.setEntitlement(req.user.tenant_id, body.featureKey, body.limitValue);
  }

  @Get('entitlements')
  listEntitlements(@Req() req: any) {
    return this.metering.listEntitlements(req.user.tenant_id);
  }

  @Get('entitlements/check')
  check(@Req() req: any, @Query('featureKey') featureKey: string, @Query('quantity') quantity?: string) {
    return this.metering.checkEntitlement(req.user.tenant_id, featureKey, quantity ? Number(quantity) : 1);
  }
}
