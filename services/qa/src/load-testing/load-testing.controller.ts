import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LoadTestingService } from './load-testing.service';

@UseGuards(JwtAuthGuard)
@Controller('test-plans/:planId/load-tests')
export class LoadTestingController {
  constructor(private readonly loadTesting: LoadTestingService) {}

  @Post()
  ingest(@Req() req: any, @Param('planId') planId: string, @Body() body: { json: string; cicdRunId?: string }) {
    return this.loadTesting.ingest(req.user.tenant_id, planId, body.json, body.cicdRunId);
  }

  @Get()
  list(@Req() req: any, @Param('planId') planId: string) {
    return this.loadTesting.list(req.user.tenant_id, planId);
  }
}
