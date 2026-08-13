import { Body, Controller, ForbiddenException, Headers, Post } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';

/** Internal, service-to-service surface — any domain service publishes its
 *  events here (e.g. services/pm on ticket transition, services/git-host on
 *  push) rather than knowing about webhook subscriptions itself. Same trust
 *  model as services/auth's internal/federation controller. */
@Controller('internal/events')
export class WebhookEventsInternalController {
  constructor(private readonly webhooks: WebhooksService) {}

  private assertTrustedCaller(secretHeader: string | undefined) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secretHeader !== expected) throw new ForbiddenException('untrusted caller');
  }

  @Post('publish')
  async publish(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantId: string; eventType: string; payload: Record<string, unknown> },
  ) {
    this.assertTrustedCaller(secret);
    return this.webhooks.publishEvent(body.tenantId, body.eventType, body.payload);
  }
}
