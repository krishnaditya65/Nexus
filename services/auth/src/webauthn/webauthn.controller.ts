import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WebauthnService } from './webauthn.service';

/** Authenticated passkey enrollment/management — the login-time exchange
 *  (options + verify against an in-flight login challenge) lives on
 *  AuthController next to the equivalent TOTP endpoints, since it must
 *  be reachable before a real access token exists. */
@UseGuards(JwtAuthGuard)
@Controller('auth/webauthn')
export class WebauthnController {
  constructor(private readonly webauthn: WebauthnService) {}

  @Post('register/options')
  startRegistration(@Req() req: any) {
    return this.webauthn.startRegistration(req.user.tenant_id, req.user.sub, req.user.email);
  }

  @Post('register/verify')
  finishRegistration(@Req() req: any, @Body() body: { response: any; nickname?: string }) {
    return this.webauthn.finishRegistration(req.user.tenant_id, req.user.sub, body.response, body.nickname);
  }

  @Get('credentials')
  listCredentials(@Req() req: any) {
    return this.webauthn.listCredentials(req.user.tenant_id, req.user.sub);
  }

  @Delete('credentials/:id')
  deleteCredential(@Req() req: any, @Param('id') id: string) {
    return this.webauthn.deleteCredential(req.user.tenant_id, req.user.sub, id);
  }
}
