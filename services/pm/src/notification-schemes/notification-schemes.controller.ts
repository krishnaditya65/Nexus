import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequiresPermission } from '../auth/permissions.decorator';
import { NotificationSchemesService } from './notification-schemes.service';

/** Reading a project's scheme is any project member's business (same
 *  tier as reading workflow-transition config, §13.1); writing it is
 *  project-structural config, gated the same way board-layout config
 *  is (`boards.manage` via the custom role builder — owner/admin always
 *  pass unconditionally, PermissionsGuard's docblock). */
@UseGuards(JwtAuthGuard)
@Controller('notification-schemes')
export class NotificationSchemesController {
  constructor(private readonly schemes: NotificationSchemesService) {}

  @Get(':projectId')
  get(@Req() req: any, @Param('projectId') projectId: string) {
    return this.schemes.getScheme(req.user.tenant_id, projectId);
  }

  @UseGuards(PermissionsGuard)
  @RequiresPermission('boards.manage')
  @Post()
  set(@Req() req: any, @Body() body: { projectId: string; eventType: string; notifyRoles: string[] }) {
    return this.schemes.setRule(req.user.tenant_id, body.projectId, body.eventType, body.notifyRoles ?? []);
  }
}
