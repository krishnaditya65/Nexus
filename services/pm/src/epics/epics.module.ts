// Epic progress rollup — computes completion count/points over an Epic's
// child tickets (tickets.parent_ticket_id). See EpicsService's docblock.
import { Module } from '@nestjs/common';
import { EpicsController } from './epics.controller';
import { EpicsService } from './epics.service';

@Module({
  controllers: [EpicsController],
  providers: [EpicsService],
  exports: [EpicsService],
})
export class EpicsModule {}
