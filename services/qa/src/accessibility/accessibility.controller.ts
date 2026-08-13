import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AccessibilityService } from './accessibility.service';

@UseGuards(JwtAuthGuard)
@Controller('test-plans/:planId/accessibility-audits')
export class AccessibilityController {
  constructor(private readonly accessibility: AccessibilityService) {}

  @Post()
  ingest(@Req() req: any, @Param('planId') planId: string, @Body() body: { json: string; cicdRunId?: string }) {
    return this.accessibility.ingest(req.user.tenant_id, planId, body.json, body.cicdRunId);
  }

  @Get()
  list(@Req() req: any, @Param('planId') planId: string) {
    return this.accessibility.list(req.user.tenant_id, planId);
  }
}
