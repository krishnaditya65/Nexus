import { Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { GuestProjectLookup } from '../auth/guest-project-lookup.decorator';
import { WikiService } from './wiki.service';

// §12.7 fast-follow — ProjectGuestGuard extended beyond TicketsController
// (docs/FEATURES.md). `@GuestProjectLookup('wiki_pages')` tells the guard
// to resolve a `:id` route param's project via `wiki_pages.project_id`
// instead of its `tickets` default. `create()` has no `:id`/`?projectId=`
// to resolve (body.projectId only) — same disclosed gap as
// TicketsController.create(), not a new one introduced here.
@UseGuards(JwtAuthGuard, ProjectGuestGuard)
@Controller('wiki-pages')
export class WikiController {
  constructor(private readonly wiki: WikiService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { projectId: string; title: string; content?: string; parentPageId?: string },
  ) {
    return this.wiki.create(
      req.user.tenant_id,
      body.projectId,
      body.title,
      body.content ?? '',
      body.parentPageId ?? null,
      req.user.sub,
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.wiki.list(req.user.tenant_id, projectId);
  }

  @GuestProjectLookup('wiki_pages')
  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.wiki.get(req.user.tenant_id, id);
  }

  @GuestProjectLookup('wiki_pages')
  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() body: { title: string; content: string }) {
    return this.wiki.update(req.user.tenant_id, id, body.title, body.content, req.user.sub);
  }

  // §13.7 — surfaced on the customer self-service portal when true.
  @GuestProjectLookup('wiki_pages')
  @Patch(':id/public')
  setPublic(@Req() req: any, @Param('id') id: string, @Body() body: { isPublic: boolean }) {
    return this.wiki.setPublic(req.user.tenant_id, id, !!body.isPublic);
  }

  @GuestProjectLookup('wiki_pages')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.wiki.remove(req.user.tenant_id, id);
  }
}
