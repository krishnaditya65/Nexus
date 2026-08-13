import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { OkrsService } from './okrs.service';

@UseGuards(JwtAuthGuard)
@Controller()
export class OkrsController {
  constructor(private readonly okrs: OkrsService) {}

  @Post('objectives')
  createObjective(
    @Req() req: any,
    @Body() body: { title: string; description?: string; period: string; ownerUserId?: string },
  ) {
    return this.okrs.createObjective(
      req.user.tenant_id,
      body.title,
      body.description ?? '',
      body.period,
      body.ownerUserId ?? null,
    );
  }

  @Get('objectives')
  listObjectives(@Req() req: any) {
    return this.okrs.listObjectives(req.user.tenant_id);
  }

  @Patch('objectives/:id/status')
  setObjectiveStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: 'active' | 'completed' | 'abandoned' },
  ) {
    return this.okrs.setObjectiveStatus(req.user.tenant_id, id, body.status);
  }

  @Post('objectives/:id/key-results')
  addKeyResult(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { title: string; epicTicketId?: string; targetValue?: number; unit?: string },
  ) {
    return this.okrs.addKeyResult(
      req.user.tenant_id,
      id,
      body.title,
      body.epicTicketId ?? null,
      body.targetValue ?? 100,
      body.unit ?? '%',
    );
  }

  @Get('objectives/:id/key-results')
  listKeyResults(@Req() req: any, @Param('id') id: string) {
    return this.okrs.listForObjective(req.user.tenant_id, id);
  }

  @Patch('key-results/:id/value')
  updateKeyResultValue(@Req() req: any, @Param('id') id: string, @Body() body: { currentValue: number }) {
    return this.okrs.updateKeyResultValue(req.user.tenant_id, id, body.currentValue);
  }
}
