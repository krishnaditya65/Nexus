import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

@Controller()
export class PushController {
  constructor(private readonly push: PushService) {}

  @UseGuards(JwtAuthGuard)
  @Post('push-subscriptions')
  subscribe(
    @Req() req: any,
    @Body() body: { endpoint: string; keys: { p256dh: string; auth: string }; userAgent?: string },
  ) {
    return this.push.subscribe(
      req.user.tenant_id,
      req.user.sub,
      body.endpoint,
      body.keys.p256dh,
      body.keys.auth,
      body.userAgent,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Delete('push-subscriptions')
  unsubscribe(@Req() req: any, @Body() body: { endpoint: string }) {
    return this.push.unsubscribe(req.user.tenant_id, req.user.sub, body.endpoint);
  }

  // --- Inbox (§12.6) ---

  @UseGuards(JwtAuthGuard)
  @Get('notifications')
  list(@Req() req: any) {
    return this.push.listForUser(req.user.tenant_id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Get('notifications/unread-count')
  unreadCount(@Req() req: any) {
    return this.push.unreadCount(req.user.tenant_id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/:id/read')
  markRead(@Req() req: any, @Param('id') id: string) {
    return this.push.markRead(req.user.tenant_id, req.user.sub, id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('notifications/read-all')
  markAllRead(@Req() req: any) {
    return this.push.markAllRead(req.user.tenant_id, req.user.sub);
  }

  /** Internal, service-to-service — incident-management (on-call paging),
   *  pm (@mentions), onboarding (approval nudges) call this rather than
   *  reimplementing push delivery. Same trust model as the other services'
   *  internal/* controllers. */
  @Post('internal/notifications/send')
  async sendInternal(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body()
    body: { tenantId: string; userId: string; title: string; body: string; category: string; projectId?: string | null },
  ) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secret !== expected) throw new ForbiddenException('untrusted caller');
    return this.push.sendToUser(body.tenantId, body.userId, body.title, body.body, body.category, body.projectId ?? null);
  }
}
