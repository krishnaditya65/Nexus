import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SprintsService } from './sprints.service';

@UseGuards(JwtAuthGuard)
@Controller('sprints')
export class SprintsController {
  constructor(private readonly sprints: SprintsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { projectId: string; name: string; goal?: string; startDate?: string; endDate?: string },
  ) {
    return this.sprints.create(
      req.user.tenant_id,
      body.projectId,
      body.name,
      body.goal ?? '',
      body.startDate ?? null,
      body.endDate ?? null,
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.sprints.list(req.user.tenant_id, projectId);
  }

  // The board view: sprint metadata + every ticket in it, board-ready.
  @Get('active-board')
  activeBoard(@Req() req: any, @Query('projectId') projectId: string) {
    return this.sprints.getActiveSprintBoard(req.user.tenant_id, projectId);
  }

  // Works for a completed sprint too, unlike active-board above — what
  // services/bi's sprint burndown fetches to reconstruct history.
  @Get(':id/tickets')
  tickets(@Req() req: any, @Param('id') id: string) {
    return this.sprints.getSprintTickets(req.user.tenant_id, id);
  }

  @Post(':id/start')
  start(@Req() req: any, @Param('id') id: string) {
    return this.sprints.start(req.user.tenant_id, id);
  }

  @Post(':id/complete')
  complete(@Req() req: any, @Param('id') id: string, @Body() body: { moveIncompleteToSprintId?: string }) {
    return this.sprints.complete(req.user.tenant_id, id, body.moveIncompleteToSprintId ?? null);
  }

  @Get('velocity')
  velocity(@Req() req: any, @Query('projectId') projectId: string) {
    return this.sprints.getVelocityTrend(req.user.tenant_id, projectId);
  }
}
