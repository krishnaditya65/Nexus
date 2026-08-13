import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPermission } from '../auth/permissions.decorator';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { BoardsService } from './boards.service';

// §12.7 fast-follow — ProjectGuestGuard extended beyond TicketsController
// (docs/FEATURES.md). A no-op for every non-guest caller; a guest's
// `GET /boards?projectId=` is checked against project_members the same
// way their `GET /tickets?projectId=` already was. `POST /boards` (board
// layout) has no `?projectId=`/`:id` to resolve — a guest fails closed
// on it, which is fine since it's already gated behind `boards.manage`,
// a permission guests don't hold by default.
@UseGuards(JwtAuthGuard, ProjectGuestGuard)
@Controller('boards')
export class BoardsController {
  constructor(private readonly boards: BoardsService) {}

  // sprintId omitted = Kanban board (all unfinished project tickets);
  // sprintId given = Scrum board (just that sprint's tickets). groupBy
  // (§13.2) splits the board into swimlane rows instead of one flat set
  // of columns — omitted = today's exact response shape, unchanged.
  @Get()
  get(
    @Req() req: any,
    @Query('projectId') projectId: string,
    @Query('sprintId') sprintId?: string,
    @Query('groupBy') groupBy?: 'assignee' | 'epic',
  ) {
    return this.boards.getBoard(req.user.tenant_id, projectId, sprintId ?? null, groupBy ?? null);
  }

  // Board layout (which states group into which column, WIP limits) is
  // project-structural config, same tier as project creation. owner/admin
  // still pass unconditionally (PermissionsGuard's docblock) — this swap
  // is the custom role builder's reference integration (§11.1/§13.8): a
  // plain 'member' granted the 'boards.manage' permission via a custom
  // role can now reach this route too, without becoming an admin.
  @UseGuards(PermissionsGuard)
  @RequiresPermission('boards.manage')
  @Post()
  replace(
    @Req() req: any,
    @Body()
    body: {
      projectId: string;
      columns: { name: string; wipLimit: number | null; workflowStateIds: string[] }[];
    },
  ) {
    return this.boards.replaceColumns(req.user.tenant_id, body.projectId, body.columns);
  }
}
