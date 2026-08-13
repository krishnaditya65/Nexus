import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RunsService } from './runs.service';

@UseGuards(JwtAuthGuard)
@Controller('pipelines/:pipelineId/runs')
export class RunsController {
  constructor(private readonly runs: RunsService) {}

  @Post()
  trigger(@Req() req: any, @Param('pipelineId') pipelineId: string, @Body() body: { commitRef?: string }) {
    return this.runs.trigger(
      req.user.tenant_id,
      pipelineId,
      body.commitRef ?? 'main',
      req.user.sub,
      'manual',
      req.headers.authorization,
    );
  }

  @Get()
  list(@Req() req: any, @Param('pipelineId') pipelineId: string) {
    return this.runs.list(req.user.tenant_id, pipelineId);
  }

  @Get(':runId')
  get(@Req() req: any, @Param('runId') runId: string) {
    return this.runs.get(req.user.tenant_id, runId);
  }

  @Post(':runId/steps/:stepId/decision')
  decideApproval(
    @Req() req: any,
    @Param('stepId') stepId: string,
    @Body() body: { approved: boolean },
  ) {
    return this.runs.decideApproval(req.user.tenant_id, stepId, req.user.sub, !!body.approved);
  }
}
