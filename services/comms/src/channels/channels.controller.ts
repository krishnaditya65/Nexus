import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ChannelsService } from './channels.service';

@UseGuards(JwtAuthGuard)
@Controller('channels')
export class ChannelsController {
  constructor(private readonly channels: ChannelsService) {}

  @Post()
  create(@Req() req: any, @Body() body: { name: string; isPrivate?: boolean }) {
    return this.channels.create(req.user.tenant_id, body.name, body.isPrivate ?? false, req.user.sub);
  }

  @Get()
  list(@Req() req: any) {
    return this.channels.listForUser(req.user.tenant_id, req.user.sub);
  }

  @Post('for-ticket/:ticketId')
  getOrCreateForTicket(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.channels.getOrCreateTicketChannel(req.user.tenant_id, ticketId, req.user.sub);
  }

  @Post(':id/members')
  addMember(@Req() req: any, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.channels.addMember(req.user.tenant_id, id, body.userId, req.user.sub);
  }

  /** Member user ids only (no display names — those live in services/auth;
   *  the frontend already has a `useTenantUsers()` hook it joins against
   *  for the same purpose on the Activity page). Used to build the
   *  @-mention picker's candidate list. */
  @Get(':id/members')
  listMembers(@Req() req: any, @Param('id') id: string) {
    return this.channels.listMembers(req.user.tenant_id, id);
  }
}
