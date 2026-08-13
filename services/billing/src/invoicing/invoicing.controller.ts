import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { InvoicingService } from './invoicing.service';

@UseGuards(JwtAuthGuard)
@Controller('invoices')
export class InvoicingController {
  constructor(private readonly invoicing: InvoicingService) {}

  // Generating and settling invoices are finance-admin actions; viewing the
  // tenant's own invoice history (below) stays open to any member.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('generate')
  generate(@Req() req: any, @Body() body: { periodStart: string; periodEnd: string }) {
    return this.invoicing.generateInvoice(req.user.tenant_id, body.periodStart, body.periodEnd);
  }

  @Get()
  list(@Req() req: any) {
    return this.invoicing.list(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/mark-paid')
  markPaid(@Req() req: any, @Param('id') id: string) {
    return this.invoicing.markPaid(req.user.tenant_id, id);
  }
}
