// Wires webhooks's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { WebhooksService } from './webhooks.service';
import { WebhooksController } from './webhooks.controller';
import { WebhookEventsInternalController } from './webhook-events-internal.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [WebhooksService],
  controllers: [WebhooksController, WebhookEventsInternalController],
})
export class WebhooksModule {}
