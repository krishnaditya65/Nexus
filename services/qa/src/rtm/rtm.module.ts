// Wires rtm's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { RtmService } from './rtm.service';
import { RtmController } from './rtm.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [RtmService],
  controllers: [RtmController],
})
export class RtmModule {}
