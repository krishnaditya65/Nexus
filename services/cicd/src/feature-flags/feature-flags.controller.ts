import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { FeatureFlagsService } from './feature-flags.service';

@UseGuards(JwtAuthGuard)
@Controller('feature-flags')
export class FeatureFlagsController {
  constructor(private readonly flags: FeatureFlagsService) {}

  // Defining/targeting a flag is release-process config, same tier as
  // environments and board layout — owner/admin.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(
    @Req() req: any,
    @Body() body: { key: string; name: string; description?: string; defaultEnabled?: boolean },
  ) {
    return this.flags.create(req.user.tenant_id, body.key, body.name, body.description ?? '', body.defaultEnabled ?? false);
  }

  @Get()
  list(@Req() req: any) {
    return this.flags.list(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':key/targets')
  setTarget(
    @Req() req: any,
    @Param('key') key: string,
    @Body() body: { environmentId: string; isEnabled: boolean; rolloutPercentage?: number },
  ) {
    return this.flags.setTarget(req.user.tenant_id, key, body.environmentId, body.isEnabled, body.rolloutPercentage ?? null);
  }

  // §13.5 — links a flag to a ticket key, same admin tier as defining the
  // flag itself.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':key/link-ticket')
  linkTicket(@Req() req: any, @Param('key') key: string, @Body() body: { ticketKey: string }) {
    return this.flags.linkTicket(req.user.tenant_id, key, body.ticketKey);
  }

  // The read side — the ticket detail page's Development Panel calls this.
  @Get('by-ticket')
  listByTicket(@Req() req: any, @Query('ticketKey') ticketKey: string) {
    return this.flags.listByTicket(req.user.tenant_id, ticketKey);
  }

  // The runtime evaluation call — deliberately left open to any
  // authenticated caller (this is what application code checks on every
  // request, not an admin action).
  @Get(':key/eval')
  evaluate(
    @Req() req: any,
    @Param('key') key: string,
    @Query('environmentId') environmentId?: string,
    @Query('bucketKey') bucketKey?: string,
  ) {
    // Falls back to the caller's own user id as the bucket key — the
    // common case ("does THIS signed-in user see the feature") needs no
    // extra query param; a caller bucketing by something else (tenant id,
    // a request id) passes bucketKey explicitly.
    return this.flags.evaluate(req.user.tenant_id, key, environmentId ?? null, bucketKey ?? req.user.sub);
  }
}
