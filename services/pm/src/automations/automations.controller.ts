import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AutomationsService } from './automations.service';

@UseGuards(JwtAuthGuard)
@Controller('automations')
export class AutomationsController {
  constructor(private readonly automations: AutomationsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      projectId: string;
      name: string;
      triggerType: string;
      triggerConfig?: Record<string, unknown>;
      actionType: string;
      actionConfig?: Record<string, unknown>;
    },
  ) {
    return this.automations.create(
      req.user.tenant_id,
      body.projectId,
      body.name,
      body.triggerType,
      body.triggerConfig ?? {},
      body.actionType,
      body.actionConfig ?? {},
      req.user.sub,
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.automations.list(req.user.tenant_id, projectId);
  }

  @Patch(':id/enabled')
  setEnabled(@Req() req: any, @Param('id') id: string, @Body() body: { enabled: boolean }) {
    return this.automations.setEnabled(req.user.tenant_id, id, body.enabled);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.automations.remove(req.user.tenant_id, id, req.user.sub);
  }

  @Get(':id/runs')
  listRuns(@Req() req: any, @Param('id') id: string) {
    return this.automations.listRuns(req.user.tenant_id, id);
  }
}
