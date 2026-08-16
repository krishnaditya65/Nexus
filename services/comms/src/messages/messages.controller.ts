import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MessagesService } from './messages.service';

@UseGuards(JwtAuthGuard)
@Controller('channels/:channelId/messages')
export class MessagesController {
  constructor(private readonly messages: MessagesService) {}

  @Post()
  post(
    @Req() req: any,
    @Param('channelId') channelId: string,
    @Body() body: { body: string; parentMessageId?: string; mentionedUserIds?: string[] },
  ) {
    return this.messages.post(
      req.user.tenant_id,
      channelId,
      req.user.sub,
      body.body,
      body.parentMessageId,
      body.mentionedUserIds,
    );
  }

  // Registered before GET '' (history) doesn't matter here — 'search' is
  // a literal path segment on a DIFFERENT route (channels/:channelId/
  // messages/search) than :messageId-shaped ones below, so there's no
  // shadowing risk the way a bare param route would create.
  @Get('search')
  search(@Req() req: any, @Param('channelId') channelId: string, @Query('q') query: string) {
    return this.messages.search(req.user.tenant_id, channelId, req.user.sub, query ?? '');
  }

  @Get()
  history(@Req() req: any, @Param('channelId') channelId: string, @Query('limit') limit?: string) {
    let parsedLimit: number | undefined;
    if (limit !== undefined) {
      parsedLimit = Number(limit);
      if (!Number.isFinite(parsedLimit)) throw new BadRequestException('limit must be a number');
    }
    return this.messages.history(req.user.tenant_id, channelId, req.user.sub, parsedLimit);
  }

  @Get(':messageId/thread')
  thread(@Req() req: any, @Param('channelId') channelId: string, @Param('messageId') messageId: string) {
    return this.messages.thread(req.user.tenant_id, channelId, messageId, req.user.sub);
  }

  @Post(':messageId/reactions')
  addReaction(
    @Req() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Body() body: { emoji: string },
  ) {
    return this.messages.addReaction(req.user.tenant_id, channelId, messageId, req.user.sub, body.emoji);
  }

  @Delete(':messageId/reactions/:emoji')
  removeReaction(
    @Req() req: any,
    @Param('channelId') channelId: string,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messages.removeReaction(req.user.tenant_id, channelId, messageId, req.user.sub, decodeURIComponent(emoji));
  }
}
