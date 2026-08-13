import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RoadmapService } from './roadmap.service';

@UseGuards(JwtAuthGuard)
@Controller('delivery-plans/:id/auto-schedule')
export class RoadmapController {
  constructor(private readonly roadmap: RoadmapService) {}

  // Preview — any project member can compute a what-if schedule; it
  // never writes. Query params let the caller experiment with a
  // different velocity/sprint length/anchor date without touching data.
  @Get()
  preview(
    @Req() req: any,
    @Param('id') planId: string,
    @Query('anchorDate') anchorDate?: string,
    @Query('sprintLengthDays') sprintLengthDays?: string,
    @Query('velocityOverride') velocityOverride?: string,
  ) {
    return this.roadmap.previewAutoSchedule(req.user.tenant_id, planId, {
      anchorDate,
      sprintLengthDays: sprintLengthDays ? Number(sprintLengthDays) : undefined,
      velocityOverride: velocityOverride ? Number(velocityOverride) : undefined,
    });
  }

  // Apply — writes computed end dates to each epic's due_date. Same
  // owner/admin tier as every other structural-config write in this
  // build (board layout, workflow logic gates, custom field screens).
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('apply')
  apply(
    @Req() req: any,
    @Param('id') planId: string,
    @Body() body: { anchorDate?: string; sprintLengthDays?: number; velocityOverride?: number } = {},
  ) {
    return this.roadmap.applyAutoSchedule(req.user.tenant_id, planId, body);
  }
}
