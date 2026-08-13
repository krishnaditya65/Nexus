// Wires calls's provider/controller into the Nest DI graph — no business
// logic of its own; see calls.service.ts for that.
import { Module } from '@nestjs/common';
import { CallsService } from './calls.service';
import { CallsController } from './calls.controller';

@Module({
  providers: [CallsService],
  controllers: [CallsController],
  exports: [CallsService],
})
export class CallsModule {}
