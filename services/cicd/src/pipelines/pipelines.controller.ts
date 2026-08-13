import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PipelinesService } from './pipelines.service';

@UseGuards(JwtAuthGuard)
@Controller('pipelines')
export class PipelinesController {
  constructor(private readonly pipelines: PipelinesService) {}

  @Post()
  create(
    @Req() req: any,
    @Body() body: { repoName: string; name: string; yamlDefinition: string; triggerEventTypes?: string[] },
  ) {
    return this.pipelines.create(
      req.user.tenant_id,
      body.repoName,
      body.name,
      body.yamlDefinition,
      body.triggerEventTypes ?? [],
    );
  }

  @Get()
  list(@Req() req: any, @Query('repoName') repoName: string) {
    return this.pipelines.list(req.user.tenant_id, repoName);
  }
}
