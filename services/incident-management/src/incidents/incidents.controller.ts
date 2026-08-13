import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { IncidentsService } from './incidents.service';

@UseGuards(JwtAuthGuard)
@Controller('incidents')
export class IncidentsController {
  constructor(private readonly incidents: IncidentsService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { title: string; severity: 'sev1' | 'sev2' | 'sev3' | 'sev4'; commanderUserId?: string },
  ) {
    return this.incidents.create(req.user.tenant_id, body.title, body.severity, body.commanderUserId ?? req.user.sub);
  }

  @Get()
  list(@Req() req: any) {
    return this.incidents.list(req.user.tenant_id);
  }

  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.incidents.get(req.user.tenant_id, id);
  }

  @Post(':id/updates')
  postUpdate(@Req() req: any, @Param('id') id: string, @Body() body: { message: string }) {
    return this.incidents.postUpdate(req.user.tenant_id, id, body.message, req.user.sub);
  }

  @Post(':id/resolve')
  resolve(@Req() req: any, @Param('id') id: string) {
    return this.incidents.resolve(req.user.tenant_id, id);
  }

  @Post(':id/postmortem')
  publishPostmortem(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { summary: string; rootCause: string; actionItems: Array<{ description: string; ownerUserId?: string }> },
  ) {
    return this.incidents.publishPostmortem(req.user.tenant_id, id, body.summary, body.rootCause, body.actionItems);
  }
}
