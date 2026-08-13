import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TestPlansService } from './test-plans.service';

@UseGuards(JwtAuthGuard)
@Controller('test-plans')
export class TestPlansController {
  constructor(private readonly testPlans: TestPlansService) {}

  @Post()
  create(@Req() req: any, @Body() body: { projectId: string; name: string; releaseRef?: string }) {
    return this.testPlans.create(req.user.tenant_id, body.projectId, body.name, body.releaseRef, req.headers.authorization);
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.testPlans.list(req.user.tenant_id, projectId, req.headers.authorization);
  }

  @Post(':id/cases')
  addCase(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title: string; gherkinText?: string; requirementTicketId?: string },
  ) {
    return this.testPlans.addCase(req.user.tenant_id, id, body.title, body.gherkinText, body.requirementTicketId);
  }

  @Get(':id/cases')
  listCases(@Req() req: any, @Param('id') id: string) {
    return this.testPlans.listCases(req.user.tenant_id, id);
  }

  @Get('progress')
  progressReport(@Req() req: any, @Query('projectId') projectId: string) {
    return this.testPlans.progressReport(req.user.tenant_id, projectId);
  }
}
