// Widget-based, configurable dashboards — see DashboardsService's
// docblock and 008_dashboards.sql for why widgets hold config, not data:
// the frontend renders each by calling the same endpoint a dedicated
// screen for that data source already calls.
import { Module } from '@nestjs/common';
import { DashboardsController } from './dashboards.controller';
import { DashboardsService } from './dashboards.service';

@Module({
  controllers: [DashboardsController],
  providers: [DashboardsService],
})
export class DashboardsModule {}
