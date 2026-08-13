import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { GuestProjectLookup } from '../auth/guest-project-lookup.decorator';
import { ReleasesService } from './releases.service';

// §12.7 fast-follow — ProjectGuestGuard extended beyond TicketsController
// (docs/FEATURES.md). `@GuestProjectLookup('releases')` resolves a `:id`
// route param's project via `releases.project_id`. `create()` (body.
// projectId only) and `tagTicket()` (keyed by `:ticketId`, not `:id` —
// this guard's param-name convention doesn't cover it) are disclosed,
// not-yet-covered gaps, same shape as TicketsController.create()'s.
@UseGuards(JwtAuthGuard, ProjectGuestGuard)
@Controller('releases')
export class ReleasesController {
  constructor(private readonly releases: ReleasesService) {}

  @Post()
  create(@Req() req: any, @Body() body: { projectId: string; name: string; description?: string; releaseDate?: string }) {
    return this.releases.create(req.user.tenant_id, body.projectId, body.name, body.description ?? '', body.releaseDate ?? null);
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.releases.list(req.user.tenant_id, projectId);
  }

  @GuestProjectLookup('releases')
  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.releases.get(req.user.tenant_id, id);
  }

  @GuestProjectLookup('releases')
  @Post(':id/status')
  setStatus(@Req() req: any, @Param('id') id: string, @Body() body: { status: string }) {
    return this.releases.setStatus(req.user.tenant_id, id, body.status);
  }

  @GuestProjectLookup('releases')
  @Get(':id/notes')
  notes(@Req() req: any, @Param('id') id: string) {
    return this.releases.releaseNotes(req.user.tenant_id, id);
  }

  @Post('tickets/:ticketId/tag')
  tagTicket(@Req() req: any, @Param('ticketId') ticketId: string, @Body() body: { releaseId: string | null }) {
    return this.releases.tagTicket(req.user.tenant_id, ticketId, body.releaseId);
  }
}
