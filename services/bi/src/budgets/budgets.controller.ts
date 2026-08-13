import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPermission } from '../auth/permissions.decorator';
import { RateCardsService } from './rate-cards.service';
import { CostReportService } from './cost-report.service';

// Budget/financial-data visibility RBAC (docs/FEATURES.md §11.1) — every
// route below now requires `budget.view` (or `budget.edit` to write a
// rate card) on top of plain tenant membership; owner/admin still pass
// unconditionally (PermissionsGuard's docblock). Before this pass, any
// authenticated tenant member could read cost-report/rate-cards data —
// a plain member's own tickets stay fully visible via pm's ordinary
// ticket read, which this change doesn't touch at all; only the
// cost/rate DATA specifically is now gated.
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller()
export class BudgetsController {
  constructor(
    private readonly rateCards: RateCardsService,
    private readonly costReport: CostReportService,
  ) {}

  @RequiresPermission('budget.edit')
  @Post('rate-cards')
  setRate(@Req() req: any, @Body() body: { userId: string; hourlyRateCents: number; currency?: string }) {
    return this.rateCards.setRate(req.user.tenant_id, body.userId, body.hourlyRateCents, body.currency ?? 'usd');
  }

  // Rate cards ARE the salary-adjacent data (an hourly rate per person) —
  // gated the same as the cost report itself, not just its write side.
  @RequiresPermission('budget.view')
  @Get('rate-cards')
  listRates(@Req() req: any) {
    return this.rateCards.list(req.user.tenant_id);
  }

  @RequiresPermission('budget.view')
  @Get('cost-report')
  report(
    @Req() req: any,
    @Query('projectId') projectId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.costReport.costReport(req.user.tenant_id, projectId, startDate, endDate, req.headers.authorization);
  }

  // §12.9 — every project's cost report, summed. See
  // CostReportService.portfolioCostReport's docblock for scope.
  @RequiresPermission('budget.view')
  @Get('portfolio-cost-report')
  portfolioReport(@Req() req: any, @Query('startDate') startDate: string, @Query('endDate') endDate: string) {
    return this.costReport.portfolioCostReport(req.user.tenant_id, startDate, endDate, req.headers.authorization);
  }
}
