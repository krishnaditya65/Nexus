import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApprovalsService } from './approvals.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class ApprovalsController {
  constructor(private readonly approvals: ApprovalsService) {}

  @Post('tickets/:ticketId/approvals')
  request(
    @Req() req: any,
    @Param('ticketId') ticketId: string,
    @Body() body: { approverUserId: string; comment?: string },
  ) {
    return this.approvals.request(req.user.tenant_id, ticketId, req.user.sub, body.approverUserId, body.comment);
  }

  @Get('tickets/:ticketId/approvals')
  list(@Req() req: any, @Param('ticketId') ticketId: string) {
    return this.approvals.list(req.user.tenant_id, ticketId);
  }

  @Get('approvals/mine')
  listForApprover(@Req() req: any) {
    return this.approvals.listForApprover(req.user.tenant_id, req.user.sub);
  }

  @Post('approvals/:id/decide')
  decide(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { decision: 'approved' | 'rejected'; comment?: string },
  ) {
    return this.approvals.decide(req.user.tenant_id, id, req.user.sub, body.decision, body.comment);
  }
}
