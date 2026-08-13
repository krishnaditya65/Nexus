import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { EnvironmentsService } from './environments.service';

@UseGuards(JwtAuthGuard)
@Controller('environments')
export class EnvironmentsController {
  constructor(private readonly environments: EnvironmentsService) {}

  // Defining a promotion environment (and whether it gates on approval) is
  // release-process config, same tier as board layout in pm — owner/admin.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(@Req() req: any, @Body() body: { repoName: string; name: string; requiresApproval?: boolean }) {
    return this.environments.create(req.user.tenant_id, body.repoName, body.name, body.requiresApproval ?? false);
  }

  @Get()
  list(@Req() req: any, @Query('repoName') repoName: string) {
    return this.environments.list(req.user.tenant_id, repoName);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post(':id/freeze-windows')
  createFreezeWindow(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { reason: string; startsAt: string; endsAt: string },
  ) {
    return this.environments.createFreezeWindow(req.user.tenant_id, id, body.reason, body.startsAt, body.endsAt);
  }

  @Get(':id/freeze-windows')
  listFreezeWindows(@Req() req: any, @Param('id') id: string) {
    return this.environments.listFreezeWindows(req.user.tenant_id, id);
  }

  @Get(':id/frozen')
  isFrozen(@Req() req: any, @Param('id') id: string) {
    return this.environments.isFrozen(req.user.tenant_id, id);
  }
}
