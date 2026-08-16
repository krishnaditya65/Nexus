import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPermission } from '../auth/permissions.decorator';
import { TimeTrackingService } from './time-tracking.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class TimeTrackingController {
  constructor(private readonly timeTracking: TimeTrackingService) {}

  @Post('time-entries')
  logTime(
    @Req() req: any,
    @Body() body: { ticketId?: string; minutes: number; description?: string; entryDate?: string },
  ) {
    return this.timeTracking.logTime(req.user.tenant_id, req.user.sub, body.ticketId, body.minutes, body.description ?? '', body.entryDate);
  }

  @Get('time-entries')
  list(@Req() req: any, @Query('weekStartDate') weekStartDate?: string) {
    return this.timeTracking.listForUser(req.user.tenant_id, req.user.sub, weekStartDate);
  }

  @Post('timesheets/:weekStartDate/submit')
  submit(@Req() req: any, @Param('weekStartDate') weekStartDate: string) {
    return this.timeTracking.submitTimesheet(req.user.tenant_id, req.user.sub, weekStartDate);
  }

  @Get('timesheets/pending-approval')
  pending(@Req() req: any) {
    return this.timeTracking.listPendingApproval(req.user.tenant_id);
  }

  @Post('timesheets/:id/approve')
  approve(@Req() req: any, @Param('id') id: string) {
    return this.timeTracking.approveTimesheet(req.user.tenant_id, id, req.user.sub);
  }

  @Post('timesheets/:id/reject')
  reject(@Req() req: any, @Param('id') id: string) {
    return this.timeTracking.rejectTimesheet(req.user.tenant_id, id, req.user.sub);
  }

  // Contractor invoicing bakes in the same rate-card (salary-adjacent) data
  // budgets.controller.ts gates behind `budget.edit` — gated identically
  // here rather than left reachable by any authenticated tenant member.
  @UseGuards(PermissionsGuard)
  @RequiresPermission('budget.edit')
  @Post('timesheets/:id/generate-invoice')
  generateInvoice(@Req() req: any, @Param('id') id: string, @Body() body: { clientName?: string }) {
    return this.timeTracking.generateContractorInvoice(
      req.user.tenant_id,
      id,
      body.clientName ?? '',
      req.headers.authorization,
    );
  }
}
