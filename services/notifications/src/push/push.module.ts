// Wires push's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { AuthModule } from '../auth/auth.module';
import { PreferencesModule } from '../preferences/preferences.module';

@Module({
  imports: [AuthModule, PreferencesModule],
  providers: [PushService],
  controllers: [PushController],
})
export class PushModule {}
