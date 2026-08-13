import { Body, Controller, Delete, ForbiddenException, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionsService, Cadence } from './subscriptions.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

@Controller()
export class SubscriptionsController {
  constructor(private readonly subscriptions: SubscriptionsService) {}

  @UseGuards(JwtAuthGuard)
  @Post('subscriptions')
  create(@Req() req: any, @Body() body: { queryId: string; projectId: string; cadence: Cadence }) {
    return this.subscriptions.create(req.user.tenant_id, req.user.sub, body);
  }

  @UseGuards(JwtAuthGuard)
  @Get('subscriptions')
  list(@Req() req: any) {
    return this.subscriptions.listForUser(req.user.tenant_id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('subscriptions/:id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.subscriptions.remove(req.user.tenant_id, req.user.sub, id);
  }

  /** Internal, service-to-service — services/notifications's
   *  SchedulerService calls this on a cron tick. Same trust model as
   *  notifications's own internal/notifications/send: a shared secret
   *  header, not a user JWT (there is no "user" for a cron tick). */
  @Post('internal/subscriptions/run-due')
  async runDue(@Headers('x-internal-secret') secret: string | undefined) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    return this.subscriptions.runDue();
  }
}
