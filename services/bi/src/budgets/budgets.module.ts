import { Module } from '@nestjs/common';
import { RateCardsService } from './rate-cards.service';
import { CostReportService } from './cost-report.service';
import { BudgetsController } from './budgets.controller';

@Module({
  providers: [RateCardsService, CostReportService],
  controllers: [BudgetsController],
  exports: [RateCardsService],
})
export class BudgetsModule {}
