import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RtmService } from './rtm.service';

@UseGuards(JwtAuthGuard)
@Controller('rtm')
export class RtmController {
  constructor(private readonly rtm: RtmService) {}

  @Get()
  generate(@Req() req: any, @Query('projectId') projectId: string) {
    return this.rtm.generate(req.user.tenant_id, projectId, req.headers.authorization);
  }
}
