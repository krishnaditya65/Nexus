import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { createTenantRateLimitGuard } from '@nexus/rate-limiter';
import { TenantAuthGuard } from '../auth/tenant-auth.guard';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { redisClient } from '../rate-limit/redis-client';
import { TicketsService } from './tickets.service';

// Burst of 30 ticket creates, sustained refill of 0.5/sec (30/min) per
// tenant — the noisy-neighbor guard: one tenant scripting bulk ticket
// creation can't starve Postgres connections/IO for every other tenant on
// this shared cluster. Read/list traffic stays unlimited; writes are the
// resource that actually needs shielding here.
const TicketCreateRateLimitGuard = createTenantRateLimitGuard(redisClient, 'pm:tickets:create', {
  capacity: 30,
  refillPerSecond: 0.5,
});

// §12.7 — ProjectGuestGuard runs AFTER TenantAuthGuard (order matters:
// it reads req.user, which TenantAuthGuard/JwtAuthGuard populates) and
// is a no-op for every non-guest caller — see its own docblock.
@UseGuards(TenantAuthGuard, ProjectGuestGuard)
@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @UseGuards(TicketCreateRateLimitGuard)
  @Post()
  create(
    @Req() req: any,
    @Body()
    body: { projectId: string; type: string; title: string; description?: string; parentTicketId?: string },
  ) {
    return this.tickets.create(
      req.user.tenant_id,
      body.projectId,
      body.type,
      body.title,
      body.description ?? '',
      body.parentTicketId ?? null,
    );
  }

  @Get()
  list(@Req() req: any, @Query('projectId') projectId: string) {
    return this.tickets.list(req.user.tenant_id, projectId);
  }

  // The backlog view: every ticket not yet assigned to a sprint, ranked.
  @Get('backlog')
  backlog(@Req() req: any, @Query('projectId') projectId: string) {
    return this.tickets.listBacklog(req.user.tenant_id, projectId);
  }

  @Post(':id/sprint')
  assignToSprint(@Req() req: any, @Param('id') id: string, @Body() body: { sprintId: string | null }) {
    return this.tickets.assignToSprint(req.user.tenant_id, id, body.sprintId ?? null);
  }

  @Post(':id/parent')
  setParent(@Req() req: any, @Param('id') id: string, @Body() body: { parentTicketId: string | null }) {
    return this.tickets.setParent(req.user.tenant_id, id, body.parentTicketId ?? null);
  }

  @Post(':id/story-points')
  setStoryPoints(@Req() req: any, @Param('id') id: string, @Body() body: { storyPoints: number | null }) {
    return this.tickets.setStoryPoints(req.user.tenant_id, id, body.storyPoints ?? null);
  }

  @Post(':id/assignee')
  assign(@Req() req: any, @Param('id') id: string, @Body() body: { assigneeUserId: string | null }) {
    return this.tickets.assign(req.user.tenant_id, id, body.assigneeUserId ?? null);
  }

  @Post(':id/due-date')
  setDueDate(@Req() req: any, @Param('id') id: string, @Body() body: { dueDate: string | null }) {
    return this.tickets.setDueDate(req.user.tenant_id, id, body.dueDate ?? null);
  }

  // Typed custom fields (§13.1) — validated against the project's
  // custom_field_definitions catalog inside TicketsService.setCustomFields
  // before the write; a BadRequestException surfaces the specific field(s)
  // that failed validation.
  @Post(':id/custom-fields')
  setCustomFields(@Req() req: any, @Param('id') id: string, @Body() body: { fields: Record<string, unknown> }) {
    return this.tickets.setCustomFields(req.user.tenant_id, id, body.fields ?? {});
  }

  // Drag-to-reorder in the backlog: place `id` between `beforeTicketId` and
  // `afterTicketId` (either may be omitted for "top of backlog"/"bottom of
  // backlog"). See TicketsService.reorderBacklog for the ranking scheme.
  @Post(':id/reorder')
  reorder(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { beforeTicketId?: string; afterTicketId?: string },
  ) {
    return this.tickets.reorderBacklog(
      req.user.tenant_id,
      id,
      body.beforeTicketId ?? null,
      body.afterTicketId ?? null,
    );
  }

  @Post(':id/transition')
  transition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { transitionName: string },
  ) {
    return this.tickets.transition(req.user.tenant_id, id, body.transitionName, {
      userId: req.user.sub,
      role: req.user.role,
    });
  }

  @Get(':id/transitions')
  getTransitions(@Req() req: any, @Param('id') id: string) {
    return this.tickets.getTransitions(req.user.tenant_id, id);
  }

  @Post(':id/links')
  link(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { targetTicketId: string; linkType: 'blocks' | 'duplicates' | 'relates_to' },
  ) {
    return this.tickets.link(req.user.tenant_id, id, body.targetTicketId, body.linkType);
  }

  @Get('graph')
  dependencyGraph(@Req() req: any, @Query('projectId') projectId: string) {
    return this.tickets.dependencyGraph(req.user.tenant_id, projectId);
  }

  @Get('critical-path')
  criticalPath(@Req() req: any, @Query('projectId') projectId: string) {
    return this.tickets.criticalPath(req.user.tenant_id, projectId);
  }

  /** §13.6 — bulk per-ticket transition history for a project, the raw
   *  material services/bi's Control Chart / CFD compute from. */
  @Get('flow-metrics')
  flowMetrics(@Req() req: any, @Query('projectId') projectId: string) {
    return this.tickets.flowMetrics(req.user.tenant_id, projectId);
  }

  @Post(':id/watch')
  watch(@Req() req: any, @Param('id') id: string) {
    return this.tickets.watch(req.user.tenant_id, id, req.user.sub);
  }

  @Post(':id/unwatch')
  unwatch(@Req() req: any, @Param('id') id: string) {
    return this.tickets.unwatch(req.user.tenant_id, id, req.user.sub);
  }

  @Get(':id/watchers')
  listWatchers(@Req() req: any, @Param('id') id: string) {
    return this.tickets.listWatchers(req.user.tenant_id, id);
  }

  @Post('bulk')
  bulkUpdate(
    @Req() req: any,
    @Body() body: { ticketIds: string[]; transitionName?: string; assigneeUserId?: string | null; sprintId?: string | null },
  ) {
    return this.tickets.bulkUpdate(
      req.user.tenant_id,
      body.ticketIds,
      {
        transitionName: body.transitionName,
        assigneeUserId: body.assigneeUserId,
        sprintId: body.sprintId,
      },
      { userId: req.user.sub, role: req.user.role },
    );
  }

  @Get(':id/links')
  listLinks(@Req() req: any, @Param('id') id: string) {
    return this.tickets.listLinks(req.user.tenant_id, id);
  }

  // Deliberately the LAST GET route in this controller — ':id' is a
  // catch-all single segment that would otherwise shadow 'backlog' and
  // 'graph' above if registered before them (Express/Nest matches routes
  // in registration order for the same HTTP method).
  @Get(':id')
  get(@Req() req: any, @Param('id') id: string) {
    return this.tickets.get(req.user.tenant_id, id, { role: req.user.role, permissions: req.user.permissions ?? [] });
  }
}
