import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { RunnerTokenGuard } from './runner-token.guard';
import { RunnersService } from './runners.service';

@Controller('runners')
export class RunnersController {
  constructor(private readonly runners: RunnersService) {}

  // ---- Human-facing management (normal user JWT) ----

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  register(@Req() req: any, @Body() body: { name: string; labels?: string[] }) {
    return this.runners.register(req.user.tenant_id, body.name, body.labels ?? []);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any) {
    return this.runners.list(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.runners.remove(req.user.tenant_id, id);
  }

  // ---- Agent-facing (runner bearer token, no user session) ----

  @UseGuards(RunnerTokenGuard)
  @Post('heartbeat')
  heartbeat(@Req() req: any) {
    return this.runners.heartbeat(req.runner.tenantId, req.runner.runnerId);
  }

  @UseGuards(RunnerTokenGuard)
  @Get('jobs/next')
  async claimNextJob(@Req() req: any, @Query('labels') labelsParam?: string) {
    const labels = (labelsParam ?? '').split(',').map((l) => l.trim()).filter(Boolean);
    const job = await this.runners.claimNextJob(req.runner.tenantId, req.runner.runnerId, labels);
    return job ?? { job: null };
  }

  @UseGuards(RunnerTokenGuard)
  @Post('jobs/:jobId/complete')
  completeJob(
    @Req() req: any,
    @Param('jobId') jobId: string,
    @Body() body: { status: 'succeeded' | 'failed'; log: string; exitCode: number },
  ) {
    return this.runners.completeJob(
      req.runner.tenantId,
      req.runner.runnerId,
      jobId,
      body.status,
      body.log ?? '',
      body.exitCode ?? 1,
    );
  }
}
