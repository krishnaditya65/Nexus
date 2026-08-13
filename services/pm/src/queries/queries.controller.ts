import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { QueriesService } from './queries.service';
import { Filter } from './filter-builder';

@UseGuards(JwtAuthGuard)
@Controller('queries')
export class QueriesController {
  constructor(private readonly queries: QueriesService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { projectId?: string; name: string; filters: Filter[]; viewType?: string; groupBy?: string },
  ) {
    return this.queries.create(
      req.user.tenant_id,
      body.projectId ?? null,
      body.name,
      body.filters,
      req.user.sub,
      body.viewType,
      body.groupBy ?? null,
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId?: string) {
    return this.queries.list(req.user.tenant_id, projectId ?? null);
  }

  @Patch(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name?: string; filters?: Filter[]; viewType?: string; groupBy?: string | null },
  ) {
    return this.queries.update(req.user.tenant_id, id, req.user.sub, body);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.queries.remove(req.user.tenant_id, id, req.user.sub);
  }

  // Ad hoc execution — run a filter set without saving it first, exactly
  // what a "filter as you build it" query editor UI needs.
  @Post('execute')
  execute(@Req() req: any, @Body() body: { projectId: string; filters: Filter[] }) {
    return this.queries.execute(req.user.tenant_id, body.projectId, body.filters);
  }

  @Get(':id/execute')
  executeSaved(@Req() req: any, @Param('id') id: string, @Query('projectId') projectId: string) {
    return this.queries.executeSaved(req.user.tenant_id, id, projectId);
  }
}
