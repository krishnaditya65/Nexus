// Wires forecasting's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { ForecastingService } from './forecasting.service';
import { ForecastingController } from './forecasting.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [ForecastingService],
  controllers: [ForecastingController],
})
export class ForecastingModule {}
