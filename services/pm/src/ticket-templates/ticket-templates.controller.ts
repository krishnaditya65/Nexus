import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TicketTemplatesService } from './ticket-templates.service';

@UseGuards(JwtAuthGuard)
@Controller('ticket-templates')
export class TicketTemplatesController {
  constructor(private readonly templates: TicketTemplatesService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { projectId: string; name: string; ticketType: string; titleTemplate: string; descriptionTemplate?: string },
  ) {
    return this.templates.create(
      req.user.tenant_id,
      body.projectId,
      body.name,
      body.ticketType,
      body.titleTemplate,
      body.descriptionTemplate ?? '',
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.templates.list(req.user.tenant_id, projectId);
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.templates.remove(req.user.tenant_id, id);
  }

  @Post(':id/create-ticket')
  createFromTemplate(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { projectId: string; title?: string; description?: string },
  ) {
    return this.templates.createFromTemplate(req.user.tenant_id, id, body.projectId, body.title, body.description);
  }
}
