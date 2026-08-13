import { Controller, Get, Param, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { EpicsService } from './epics.service';

@UseGuards(JwtAuthGuard)
@Controller('epics')
export class EpicsController {
  constructor(private readonly epics: EpicsService) {}

  @Get(':id/rollup')
  rollup(@Req() req: any, @Param('id') id: string) {
    return this.epics.rollup(req.user.tenant_id, id);
  }

  // Roadmap/portfolio view: every epic in a project, rolled up, one call.
  @Get()
  rollupAll(@Req() req: any, @Query('projectId') projectId: string) {
    return this.epics.rollupAllEpics(req.user.tenant_id, projectId);
  }
}
