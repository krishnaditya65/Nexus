// Wires time-tracking's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { TimeTrackingService } from './time-tracking.service';
import { TimeTrackingController } from './time-tracking.controller';
import { AuthModule } from '../auth/auth.module';
import { BudgetsModule } from '../budgets/budgets.module';

@Module({
  imports: [AuthModule, BudgetsModule],
  providers: [TimeTrackingService],
  controllers: [TimeTrackingController],
})
export class TimeTrackingModule {}
