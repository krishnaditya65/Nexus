import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TestExecutionsService } from './test-executions.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TestExecutionsController {
  constructor(private readonly executions: TestExecutionsService) {}

  @Post('test-plans/:planId/ingest-junit')
  ingestJUnit(
    @Req() req: any,
    @Param('planId') planId: string,
    @Body() body: { xml: string; cicdRunId?: string; browser?: string; os?: string },
  ) {
    return this.executions.ingestJUnit(
      req.user.tenant_id,
      planId,
      body.xml,
      body.cicdRunId,
      body.browser,
      body.os,
    );
  }

  @Get('test-plans/:planId/browser-matrix')
  browserMatrix(@Req() req: any, @Param('planId') planId: string) {
    return this.executions.browserMatrix(req.user.tenant_id, planId);
  }

  @Get('flaky-tests')
  listQuarantined(@Req() req: any) {
    return this.executions.listQuarantined(req.user.tenant_id);
  }

  @Post('flaky-tests/:testCaseId/unquarantine')
  unquarantine(@Req() req: any, @Param('testCaseId') testCaseId: string) {
    return this.executions.unquarantine(req.user.tenant_id, testCaseId);
  }
}
