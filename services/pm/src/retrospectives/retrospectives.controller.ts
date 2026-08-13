import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RetrospectivesService } from './retrospectives.service';

@UseGuards(JwtAuthGuard)
@Controller('retrospectives')
export class RetrospectivesController {
  constructor(private readonly retros: RetrospectivesService) {}

  @Post()
  create(@Req() req: any, @Body() body: { projectId: string; title: string; sprintId?: string }) {
    return this.retros.create(req.user.tenant_id, body.projectId, body.title, body.sprintId ?? null, req.user.sub);
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.retros.list(req.user.tenant_id, projectId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.retros.getWithItems(req.user.tenant_id, id);
  }

  @Post(':id/items')
  addItem(@Req() req: any, @Param('id') id: string, @Body() body: { category: string; content: string }) {
    return this.retros.addItem(req.user.tenant_id, id, body.category, body.content, req.user.sub);
  }

  @Delete('items/:itemId')
  removeItem(@Req() req: any, @Param('itemId') itemId: string) {
    return this.retros.removeItem(req.user.tenant_id, itemId);
  }

  @Post(':id/close')
  close(@Req() req: any, @Param('id') id: string) {
    return this.retros.close(req.user.tenant_id, id);
  }
}
