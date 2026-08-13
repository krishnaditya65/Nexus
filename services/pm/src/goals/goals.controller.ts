import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { GoalsService } from './goals.service';

@UseGuards(JwtAuthGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly goals: GoalsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body()
    body: {
      projectId: string;
      name: string;
      goalType: string;
      targetValue: number;
      unit?: string;
      ownerUserId?: string;
      dueDate?: string;
    },
  ) {
    return this.goals.create(
      req.user.tenant_id,
      body.projectId,
      body.name,
      body.goalType,
      body.targetValue,
      body.unit ?? '',
      body.ownerUserId ?? null,
      body.dueDate ?? null,
      req.user.sub,
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.goals.list(req.user.tenant_id, projectId);
  }

  @Patch(':id/value')
  updateValue(@Req() req: any, @Param('id') id: string, @Body() body: { currentValue: number }) {
    return this.goals.updateValue(req.user.tenant_id, id, body.currentValue);
  }

  @Patch(':id/status')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string }) {
    return this.goals.setStatus(req.user.tenant_id, id, body.status);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.goals.remove(req.user.tenant_id, id);
  }
}
