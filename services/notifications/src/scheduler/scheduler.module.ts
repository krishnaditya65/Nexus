// Wires scheduler's provider into the Nest DI graph — no controller (this
// module only fires an internal @Cron tick, nothing external calls it
// directly); see scheduler.service.ts for the actual job.
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SchedulerService } from './scheduler.service';
import { DigestModule } from '../digest/digest.module';

@Module({
  imports: [ScheduleModule.forRoot(), DigestModule],
  providers: [SchedulerService],
})
export class SchedulerModule {}
