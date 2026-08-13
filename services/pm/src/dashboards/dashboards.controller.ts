import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DashboardsService } from './dashboards.service';

@UseGuards(JwtAuthGuard)
@Controller('dashboards')
export class DashboardsController {
  constructor(private readonly dashboards: DashboardsService) {}

  @Post()
  create(@Req() req: any, @Body() body: { projectId: string; name: string }) {
    return this.dashboards.create(req.user.tenant_id, body.projectId, body.name, req.user.sub);
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.dashboards.list(req.user.tenant_id, projectId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.dashboards.getWithWidgets(req.user.tenant_id, id);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.dashboards.remove(req.user.tenant_id, id);
  }

  @Post(':id/widgets')
  addWidget(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { widgetType: string; title: string; config?: Record<string, unknown> },
  ) {
    return this.dashboards.addWidget(req.user.tenant_id, id, body.widgetType, body.title, body.config ?? {});
  }

  @Delete('widgets/:widgetId')
  removeWidget(@Req() req: any, @Param('widgetId') widgetId: string) {
    return this.dashboards.removeWidget(req.user.tenant_id, widgetId);
  }
}
