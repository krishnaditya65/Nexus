import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebhooksService } from './webhooks.service';

@Controller('webhook-subscriptions')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService) {}

  @UseGuards(JwtAuthGuard)
  @Post()
  subscribe(@Req() req: any, @Body() body: { targetUrl: string; eventTypes: string[] }) {
    return this.webhooks.subscribe(req.user.tenant_id, body.targetUrl, body.eventTypes);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any) {
    return this.webhooks.list(req.user.tenant_id);
  }
}
