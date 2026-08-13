import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DeploymentsService } from './deployments.service';

@UseGuards(JwtAuthGuard)
@Controller('deployments')
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  // Requesting a promotion is left open to any authenticated member
  // (routine release activity, like triggering a pipeline run) — the
  // approval gate below is where owner/admin-only actually matters.
  @Post()
  request(
    @Req() req: any,
    @Body()
    body: {
      environmentId: string;
      pipelineRunId: string;
      strategy?: 'direct' | 'canary' | 'blue_green';
      canaryStages?: number[];
      autoRollbackErrorRateThreshold?: number;
    },
  ) {
    return this.deployments.request(
      req.user.tenant_id,
      body.environmentId,
      body.pipelineRunId,
      req.user.sub,
      body.strategy ?? 'direct',
      body.canaryStages,
      body.autoRollbackErrorRateThreshold,
    );
  }

  @Get()
  list(@Req() req: any, @Query('environmentId') environmentId: string) {
    return this.deployments.list(req.user.tenant_id, environmentId);
  }

  /** §13.5 — the query the ticket detail page's Development Panel calls
   *  per linked PR (repo + source branch) to answer "which environment(s)
   *  has this branch actually reached." */
  @Get('by-branch')
  listByBranch(@Req() req: any, @Query('repoName') repoName: string, @Query('branch') branch: string) {
    return this.deployments.listByBranch(req.user.tenant_id, repoName, branch);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/approve')
  approve(@Req() req: any, @Param('id') id: string) {
    return this.deployments.approve(req.user.tenant_id, id, req.user.sub);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/reject')
  reject(@Req() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.deployments.reject(req.user.tenant_id, id, req.user.sub, body.reason);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/promote-stage')
  promoteCanaryStage(@Req() req: any, @Param('id') id: string) {
    return this.deployments.promoteCanaryStage(req.user.tenant_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/cutover')
  cutover(@Req() req: any, @Param('id') id: string) {
    return this.deployments.cutover(req.user.tenant_id, id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/rollback')
  rollback(@Req() req: any, @Param('id') id: string, @Body() body: { reason: string }) {
    return this.deployments.rollback(req.user.tenant_id, id, body.reason);
  }

  // Real APM ingestion endpoint — no @Roles restriction, since the caller
  // is expected to be a monitoring exporter/agent authenticated with a
  // service-level user token, not necessarily an owner/admin human.
  @Post(':id/metrics')
  recordMetric(@Req() req: any, @Param('id') id: string, @Body() body: { metricName: string; value: number }) {
    return this.deployments.recordMetric(req.user.tenant_id, id, body.metricName, body.value);
  }

  @Get(':id/metrics')
  listMetrics(@Req() req: any, @Param('id') id: string) {
    return this.deployments.listMetrics(req.user.tenant_id, id);
  }
}
