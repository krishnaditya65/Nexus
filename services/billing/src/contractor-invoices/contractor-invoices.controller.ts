import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ContractorInvoicesService } from './contractor-invoices.service';

@UseGuards(JwtAuthGuard)
@Controller('contractor-invoices')
export class ContractorInvoicesController {
  constructor(private readonly invoices: ContractorInvoicesService) {}

  // Owner/admin only — same gate as vendor-spend, since this creates a
  // real accounts-receivable record. Called by services/bi's
  // generate-invoice endpoint, forwarding the triggering caller's own
  // token (the established cross-service auth pattern), not by end users
  // directly against this route in the normal flow.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      contractorUserId: string;
      timesheetId: string;
      clientName?: string;
      hours: number;
      rateCentsPerHour: number;
    },
  ) {
    return this.invoices.create(
      req.user.tenant_id,
      body.contractorUserId,
      body.timesheetId,
      body.clientName ?? '',
      body.hours,
      body.rateCentsPerHour,
    );
  }

  @Get()
  list(@Req() req: any) {
    return this.invoices.list(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Patch(':id/status')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: 'issued' | 'paid' | 'void' }) {
    return this.invoices.setStatus(req.user.tenant_id, id, body.status);
  }
}
