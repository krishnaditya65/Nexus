import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { MfaService } from './mfa.service';

@UseGuards(JwtAuthGuard)
@Controller('auth/mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get('status')
  status(@Req() req: any) {
    return this.mfa.status(req.user.tenant_id, req.user.sub);
  }

  @Post('enroll')
  enroll(@Req() req: any) {
    return this.mfa.startEnrollment(req.user.tenant_id, req.user.sub, req.user.email);
  }

  @Post('enroll/confirm')
  confirmEnrollment(@Req() req: any, @Body() body: { code: string }) {
    return this.mfa.confirmEnrollment(req.user.tenant_id, req.user.sub, body.code);
  }

  @Post('disable')
  disable(@Req() req: any, @Body() body: { password: string; code: string }) {
    return this.mfa.disable(req.user.tenant_id, req.user.sub, body.password, body.code);
  }
}
