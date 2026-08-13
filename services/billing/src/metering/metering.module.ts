// Wires metering's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { MeteringService } from './metering.service';
import { MeteringController } from './metering.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [MeteringService],
  controllers: [MeteringController],
  exports: [MeteringService],
})
export class MeteringModule {}
