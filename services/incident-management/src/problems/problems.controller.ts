import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProblemsService, ProblemStatus } from './problems.service';

@UseGuards(JwtAuthGuard)
@Controller('problems')
export class ProblemsController {
  constructor(private readonly problems: ProblemsService) {}

  @Post()
  create(@Req() req: any, @Body() body: { title: string; description?: string; ownerUserId?: string }) {
    return this.problems.create(req.user.tenant_id, body.title, body.description ?? '', body.ownerUserId ?? null);
  }

  @Get()
  list(@Req() req: any, @Query('status') status?: ProblemStatus) {
    return this.problems.list(req.user.tenant_id, status);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.problems.get(req.user.tenant_id, id);
  }

  @Post(':id')
  update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status?: ProblemStatus; rootCause?: string; workaround?: string; actionItems?: unknown[] },
  ) {
    return this.problems.update(req.user.tenant_id, id, body);
  }

  @Post(':id/link-incident')
  linkIncident(@Req() req: any, @Param('id') id: string, @Body() body: { incidentId: string }) {
    return this.problems.linkIncident(req.user.tenant_id, id, body.incidentId);
  }

  @Post('unlink-incident/:incidentId')
  unlinkIncident(@Req() req: any, @Param('incidentId') incidentId: string) {
    return this.problems.unlinkIncident(req.user.tenant_id, incidentId);
  }
}
