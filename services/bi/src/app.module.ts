import { Module } from '@nestjs/common';
import { TimeTrackingModule } from './time-tracking/time-tracking.module';
import { ForecastingModule } from './forecasting/forecasting.module';
import { SprintBurndownModule } from './sprint-burndown/sprint-burndown.module';
import { BudgetsModule } from './budgets/budgets.module';
import { HealthModule } from './health/health.module';
import { FlowMetricsModule } from './flow-metrics/flow-metrics.module';

/**
 * bi service — time tracking/timesheets, Monte Carlo delivery forecasting,
 * sprint burndown (ideal vs actual remaining story points, reading
 * services/pm's sprints live), and budget estimation/CapEx-OpEx reporting
 * from real logged time × per-user hourly rates (see src/budgets — this is
 * where rate cards actually live, not services/billing, which owns
 * subscription/usage billing, a distinct concern from labor costing).
 * Contractor invoicing generated from approved timesheets, OKRs linked to
 * Epics, and dashboard-builder scheduled exports remain ⚪.
 */
@Module({
  imports: [
    TimeTrackingModule,
    ForecastingModule,
    SprintBurndownModule,
    BudgetsModule,
    HealthModule,
    FlowMetricsModule,
  ],
})
export class AppModule {}
