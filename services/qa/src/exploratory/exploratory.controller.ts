import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ExploratoryService } from './exploratory.service';

@UseGuards(JwtAuthGuard)
@Controller('exploratory-sessions')
export class ExploratoryController {
  constructor(private readonly exploratory: ExploratoryService) {}

  @Post()
  start(@Req() req: any, @Body() body: { projectId: string; charter: string }) {
    return this.exploratory.start(req.user.tenant_id, body.projectId, body.charter, req.user.sub);
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.exploratory.list(req.user.tenant_id, projectId);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.exploratory.get(req.user.tenant_id, id);
  }

  @Post(':id/notes')
  addNote(@Req() req: any, @Param('id') id: string, @Body() body: { noteText: string; bugTicketId?: string }) {
    return this.exploratory.addNote(req.user.tenant_id, id, body.noteText, body.bugTicketId);
  }

  @Get(':id/notes')
  listNotes(@Req() req: any, @Param('id') id: string) {
    return this.exploratory.listNotes(req.user.tenant_id, id);
  }

  @Post(':id/complete')
  complete(@Req() req: any, @Param('id') id: string, @Body() body: { outcome: string }) {
    return this.exploratory.complete(req.user.tenant_id, id, body.outcome, req.user.sub);
  }
}
