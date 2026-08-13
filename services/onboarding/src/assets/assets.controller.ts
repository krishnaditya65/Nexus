import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AssetsService, AssetType, AssetStatus } from './assets.service';

@UseGuards(JwtAuthGuard)
@Controller('assets')
export class AssetsController {
  constructor(private readonly assets: AssetsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: { assetTag: string; name: string; assetType: AssetType; serialNumber?: string; purchaseDate?: string; warrantyExpires?: string },
  ) {
    return this.assets.create(req.user.tenant_id, body);
  }

  @Get()
  list(
    @Req() req: any,
    @Query('status') status?: AssetStatus,
    @Query('assetType') assetType?: AssetType,
    @Query('assignedToUserId') assignedToUserId?: string,
  ) {
    return this.assets.list(req.user.tenant_id, { status, assetType, assignedToUserId });
  }

  // Static-segment routes ('by-ticket/...') must be declared BEFORE the
  // ':id' catch-all below — Nest matches in declaration order, so a
  // ':id'-first ordering would swallow "by-ticket" as a literal id.
  @Get('by-ticket/:ticketId')
  listByTicket(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.assets.listByTicket(req.user.tenant_id, ticketId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.assets.get(req.user.tenant_id, id);
  }

  @Post(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status?: AssetStatus; assignedToUserId?: string | null; warrantyExpires?: string },
  ) {
    return this.assets.update(req.user.tenant_id, id, body);
  }

  @Post(':id/link-ticket')
  linkTicket(@Req() req: any, @Param('id') id: string, @Body() body: { ticketId: string; ticketKey: string }) {
    return this.assets.linkTicket(req.user.tenant_id, id, body.ticketId, body.ticketKey);
  }
}
