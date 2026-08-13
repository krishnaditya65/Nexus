// api-platform service — API keys, webhook subscriptions + HMAC-signed delivery.
import { Module } from '@nestjs/common';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { HealthModule } from './health/health.module';
import { ConnectorsModule } from './connectors/connectors.module';

@Module({
  imports: [ApiKeysModule, WebhooksModule, HealthModule, ConnectorsModule],
})
export class AppModule {}
