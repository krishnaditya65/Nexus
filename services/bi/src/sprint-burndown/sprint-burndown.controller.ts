import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SprintBurndownService } from './sprint-burndown.service';

@UseGuards(JwtAuthGuard)
@Controller('sprints')
export class SprintBurndownController {
  constructor(private readonly burndown: SprintBurndownService) {}

  @Get(':id/burndown')
  get(@Req() req: any, @Param('id') id: string) {
    return this.burndown.burndown(req.user.tenant_id, id, req.headers.authorization);
  }

  @Get(':id/burnup')
  getBurnup(@Req() req: any, @Param('id') id: string) {
    return this.burndown.burnup(req.user.tenant_id, id, req.headers.authorization);
  }
}
