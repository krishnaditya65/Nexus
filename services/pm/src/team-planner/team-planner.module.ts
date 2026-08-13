// Per-sprint, per-person capacity vs allocated-work view — see
// TeamPlannerService's docblock for why capacity is in story points, not
// hours+days-off like ADO's own Team Planner.
import { Module } from '@nestjs/common';
import { TeamPlannerController } from './team-planner.controller';
import { TeamPlannerService } from './team-planner.service';

@Module({
  controllers: [TeamPlannerController],
  providers: [TeamPlannerService],
})
export class TeamPlannerModule {}
