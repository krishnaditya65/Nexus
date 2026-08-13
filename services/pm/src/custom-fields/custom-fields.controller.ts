import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { CustomFieldsService, FieldType } from './custom-fields.service';

// Field DEFINITIONS and their per-issue-type SCREEN layout are project-
// structural config, same tier as workflow-transition config
// (workflow.controller docblock) and board layout (boards.controller
// docblock) — owner/admin only to write, any authenticated project member
// to read (so the ticket-detail/create forms can render them).
@UseGuards(JwtAuthGuard)
@Controller('projects/:projectId/custom-fields')
export class CustomFieldsController {
  constructor(private readonly fields: CustomFieldsService) {}

  @Get()
  list(@Req() req: any, @Param('projectId') projectId: string) {
    return this.fields.listDefinitions(req.user.tenant_id, projectId);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  create(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body()
    body: {
      key: string;
      label: string;
      fieldType: FieldType;
      options?: string[];
      issueTypes?: string[];
      isRequired?: boolean;
      restrictedToPermission?: string | null;
    },
  ) {
    return this.fields.createDefinition(req.user.tenant_id, projectId, body);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.fields.deleteDefinition(req.user.tenant_id, id);
  }

  @Get('screens')
  getScreen(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Query('issueType') issueType: string,
    @Query('screen') screen: 'create' | 'edit',
  ) {
    return this.fields.getScreen(req.user.tenant_id, projectId, issueType, screen);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('screens')
  setScreen(
    @Req() req: any,
    @Param('projectId') projectId: string,
    @Body() body: { issueType: string; screen: 'create' | 'edit'; fieldIds: string[] },
  ) {
    return this.fields.setScreen(req.user.tenant_id, projectId, body.issueType, body.screen, body.fieldIds);
  }
}
