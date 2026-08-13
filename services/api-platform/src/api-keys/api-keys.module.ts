// Wires api-keys's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { ApiKeysController } from './api-keys.controller';
import { ApiKeysInternalController } from './api-keys-internal.controller';
import { ApiKeyGuard } from './api-key.guard';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ApiKeysService, ApiKeyGuard],
  controllers: [ApiKeysController, ApiKeysInternalController],
  exports: [ApiKeysService, ApiKeyGuard],
})
export class ApiKeysModule {}
