import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { VendorSpendService } from './vendor-spend.service';

@UseGuards(JwtAuthGuard)
@Controller('vendor-subscriptions')
export class VendorSpendController {
  constructor(private readonly vendorSpend: VendorSpendService) {}

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      vendorName: string;
      category?: string;
      monthlyCostCents: number;
      currency?: string;
      renewalDate?: string;
      notes?: string;
    },
  ) {
    return this.vendorSpend.create(
      req.user.tenant_id,
      body.vendorName,
      body.category ?? 'other',
      body.monthlyCostCents,
      body.currency ?? 'usd',
      body.renewalDate ?? null,
      body.notes ?? '',
    );
  }

  @Get()
  list(@Req() req: any) {
    return this.vendorSpend.list(req.user.tenant_id);
  }

  @Get('summary')
  summary(@Req() req: any) {
    return this.vendorSpend.summary(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.vendorSpend.remove(req.user.tenant_id, id);
  }
}
