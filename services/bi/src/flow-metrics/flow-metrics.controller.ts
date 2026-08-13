import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FlowMetricsService } from './flow-metrics.service';

@UseGuards(JwtAuthGuard)
@Controller('flow-metrics')
export class FlowMetricsController {
  constructor(private readonly flowMetrics: FlowMetricsService) {}

  @Get('control-chart')
  controlChart(@Req() req: any, @Query('projectId') projectId: string) {
    return this.flowMetrics.controlChart(projectId, req.headers.authorization);
  }

  @Get('cumulative-flow')
  cumulativeFlow(@Req() req: any, @Query('projectId') projectId: string) {
    return this.flowMetrics.cumulativeFlow(projectId, req.headers.authorization);
  }
}
