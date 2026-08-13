import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TeamPlannerService } from './team-planner.service';

@UseGuards(JwtAuthGuard)
@Controller('team-planner')
export class TeamPlannerController {
  constructor(private readonly planner: TeamPlannerService) {}

  @Post('capacity')
  setCapacity(@Req() req: any, @Body() body: { sprintId: string; userId: string; capacityPoints: number }) {
    return this.planner.setCapacity(req.user.tenant_id, body.sprintId, body.userId, body.capacityPoints);
  }

  // Static route registered BEFORE ':sprintId' — same route-ordering
  // discipline as every other controller in this build with a bare
  // dynamic segment at this depth (assets, comms calls); 'portfolio-
  // capacity' would otherwise be swallowed as a literal :sprintId value.
  @Get('portfolio-capacity')
  portfolioCapacityRollup(@Req() req: any) {
    return this.planner.portfolioCapacityRollup(req.user.tenant_id);
  }

  @Get(':sprintId')
  getPlan(@Req() req: any, @Param('sprintId') sprintId: string) {
    return this.planner.getPlan(req.user.tenant_id, sprintId);
  }
}
