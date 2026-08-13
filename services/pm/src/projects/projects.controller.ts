import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { ProjectsService } from './projects.service';

@UseGuards(JwtAuthGuard)
@Controller('projects')
export class ProjectsController {
  constructor(private readonly projects: ProjectsService) {}

  // Standing up a new project is an org-structural action (it creates the
  // workflow-state space every ticket in it will live under) — same tier
  // as auth-service's user-invite endpoint, so it gets the same guard pair.
  // Order matters: JwtAuthGuard must populate req.user before RolesGuard
  // reads req.user.role (see services/auth/src/auth/roles.guard.ts).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(@Req() req: any, @Body() body: { key: string; name: string }) {
    return this.projects.create(req.user.tenant_id, body.key, body.name);
  }

  @Get()
  list(@Req() req: any) {
    return this.projects.list(req.user.tenant_id, req.user.sub, !!req.user.is_guest);
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.projects.getById(req.user.tenant_id, id);
  }

  @Get(':id/workflow-states')
  workflowStates(@Req() req: any, @Param('id') id: string) {
    return this.projects.workflowStates(req.user.tenant_id, id);
  }

  // §13.1 — Conditions/Validators/Post Functions config surface. Reading
  // the list is open to any project member (same tier as workflow-states
  // itself); editing the logic gates is owner/admin, same tier as the
  // board-layout config PermissionsGuard's boards.manage permission also
  // reaches — a genuinely separate lift from this pass, not retrofitted
  // here to keep this slice's scope legible.
  @Get(':id/workflow-transitions')
  workflowTransitions(@Req() req: any, @Param('id') id: string) {
    return this.projects.workflowTransitions(req.user.tenant_id, id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch('workflow-transitions/:transitionId')
  updateWorkflowTransition(
    @Req() req: any,
    @Param('transitionId') transitionId: string,
    @Body() body: { conditions?: unknown[]; validators?: unknown[]; postFunctions?: unknown[] },
  ) {
    return this.projects.updateWorkflowTransition(req.user.tenant_id, transitionId, body);
  }

  // --- Visual workflow designer (§13.1) — the state-graph editor itself,
  // distinct from the logic-gates editor above. owner/admin only to
  // mutate, same tier as board-layout/logic-gates config; any project
  // member can already read via workflow-states/workflow-transitions
  // above (unchanged, reused as this designer's read side too). ---

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/workflow-states')
  createWorkflowState(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name: string; isInitial?: boolean; isTerminal?: boolean },
  ) {
    return this.projects.createWorkflowState(req.user.tenant_id, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Patch('workflow-states/:stateId')
  updateWorkflowState(
    @Req() req: any,
    @Param('stateId') stateId: string,
    @Body() body: { name?: string; isInitial?: boolean; isTerminal?: boolean },
  ) {
    return this.projects.updateWorkflowState(req.user.tenant_id, stateId, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete('workflow-states/:stateId')
  deleteWorkflowState(@Req() req: any, @Param('stateId') stateId: string) {
    return this.projects.deleteWorkflowState(req.user.tenant_id, stateId);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/workflow-transitions')
  createWorkflowTransition(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { name: string; fromStateId: string; toStateId: string },
  ) {
    return this.projects.createWorkflowTransition(req.user.tenant_id, id, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete('workflow-transitions/:transitionId')
  deleteWorkflowTransition(@Req() req: any, @Param('transitionId') transitionId: string) {
    return this.projects.deleteWorkflowTransition(req.user.tenant_id, transitionId);
  }

  // --- Guest/external collaboration (§12.7) — owner/admin only, same
  // tier as inviting a user at all. ---

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/members')
  addMember(@Req() req: any, @Param('id') id: string, @Body() body: { userId: string }) {
    return this.projects.addMember(req.user.tenant_id, id, body.userId, req.user.sub);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id/members/:userId')
  removeMember(@Req() req: any, @Param('id') id: string, @Param('userId') userId: string) {
    return this.projects.removeMember(req.user.tenant_id, id, userId);
  }

  @Get(':id/members')
  listMembers(@Req() req: any, @Param('id') id: string) {
    return this.projects.listMembers(req.user.tenant_id, id);
  }
}
