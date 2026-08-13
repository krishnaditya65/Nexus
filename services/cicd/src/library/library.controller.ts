import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LibraryService } from './library.service';

@UseGuards(JwtAuthGuard)
@Controller('library')
export class LibraryController {
  constructor(private readonly library: LibraryService) {}

  @Get('variable-groups')
  listVariableGroups(@Req() req: any) {
    return this.library.listVariableGroups(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('variable-groups')
  createVariableGroup(@Req() req: any, @Body() body: { name: string }) {
    return this.library.createVariableGroup(req.user.tenant_id, body.name);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('variable-groups/:id/entries')
  setEntry(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { key: string; value: string; isSecret?: boolean },
  ) {
    return this.library.setEntry(req.user.tenant_id, id, body.key, body.value, body.isSecret ?? false);
  }

  @Get('secure-files')
  listSecureFiles(@Req() req: any) {
    return this.library.listSecureFiles(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('secure-files')
  uploadSecureFile(@Req() req: any, @Body() body: { name: string; contentBase64: string }) {
    return this.library.uploadSecureFile(req.user.tenant_id, body.name, body.contentBase64);
  }

  @Get('task-groups')
  listTaskGroups(@Req() req: any) {
    return this.library.listTaskGroups(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('task-groups')
  createTaskGroup(
    @Req() req: any,
    @Body() body: { name: string; steps: Array<{ name: string; run: string; image?: string }> },
  ) {
    return this.library.createTaskGroup(req.user.tenant_id, body.name, body.steps);
  }

  @Get('pipeline-templates')
  listPipelineTemplates(@Req() req: any) {
    return this.library.listPipelineTemplates(req.user.tenant_id);
  }

  @Post('pipeline-templates')
  savePipelineTemplate(
    @Req() req: any,
    @Body() body: { name: string; description?: string; yamlDefinition: string },
  ) {
    return this.library.savePipelineTemplate(req.user.tenant_id, body.name, body.description ?? '', body.yamlDefinition);
  }

  @Delete('pipeline-templates/:id')
  removePipelineTemplate(@Req() req: any, @Param('id') id: string) {
    return this.library.removePipelineTemplate(req.user.tenant_id, id);
  }
}
