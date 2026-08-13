import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DigestService } from './digest.service';

@UseGuards(JwtAuthGuard)
@Controller('digest-settings')
export class DigestController {
  constructor(private readonly digest: DigestService) {}

  @Get()
  async get(@Req() req: any) {
    return { frequency: await this.digest.getFrequency(req.user.tenant_id, req.user.sub) };
  }

  @Post()
  set(@Req() req: any, @Body() body: { frequency: string }) {
    return this.digest.setFrequency(req.user.tenant_id, req.user.sub, body.frequency);
  }
}
