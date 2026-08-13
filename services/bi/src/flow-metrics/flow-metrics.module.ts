// Wires flow-metrics's provider/controller into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { FlowMetricsService } from './flow-metrics.service';
import { FlowMetricsController } from './flow-metrics.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [FlowMetricsService],
  controllers: [FlowMetricsController],
})
export class FlowMetricsModule {}
