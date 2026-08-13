// Wires okrs's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { OkrsService } from './okrs.service';
import { OkrsController } from './okrs.controller';
import { AuthModule } from '../auth/auth.module';
import { EpicsModule } from '../epics/epics.module';

@Module({
  imports: [AuthModule, EpicsModule],
  providers: [OkrsService],
  controllers: [OkrsController],
  exports: [OkrsService],
})
export class OkrsModule {}
