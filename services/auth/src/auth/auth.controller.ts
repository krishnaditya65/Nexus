import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { Roles } from './roles.decorator';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('login')
  async login(
    @Req() req: any,
    @Body() body: { tenantSlug: string; email: string; password: string; deviceId?: string },
  ) {
    // req.ip resolves to the immediate connecting peer (no reverse-proxy
    // 'trust proxy' config in this dev/test deployment) — a production
    // deployment behind a load balancer would need main.ts's Express app
    // configured to trust the LB and read X-Forwarded-For instead.
    return this.auth.login(body.tenantSlug, body.email, body.password, req.ip, req.headers['user-agent'], body.deviceId);
  }

  /** Second half of a new-device-gated login (docs/FEATURES.md §11.1) —
   *  exchanges the challenge from `login()` above plus the emailed
   *  6-digit code for a real access token, and remembers the device so
   *  future logins from it skip this. Deliberately its own endpoint,
   *  same "impossible to confuse in client code" reasoning as the MFA
   *  verify endpoint below. */
  @Post('device/verify')
  async deviceVerify(@Req() req: any, @Body() body: { tenantSlug: string; challengeId: string; code: string }) {
    return this.auth.verifyDeviceAndLogin(body.tenantSlug, body.challengeId, body.code, req.ip, req.headers['user-agent']);
  }

  /** Self-service device management — see (authenticated) sessions/
   *  passkeys pages for the same "list + revoke your own" shape. */
  @UseGuards(JwtAuthGuard)
  @Get('devices')
  listDevices(@Req() req: any) {
    return this.auth.listKnownDevices(req.user.tenant_id, req.user.sub);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('devices/:id')
  forgetDevice(@Req() req: any, @Param('id') id: string) {
    return this.auth.forgetDevice(req.user.tenant_id, req.user.sub, id);
  }

  /** Second half of an MFA-gated login — exchanges the challenge from
   *  `login()` above plus a TOTP/recovery code for a real access token.
   *  Deliberately its own endpoint, not a body-shape variant of `login`,
   *  so the two flows are impossible to confuse in client code. */
  @Post('mfa/login-verify')
  async mfaLoginVerify(@Req() req: any, @Body() body: { tenantSlug: string; challengeId: string; code: string }) {
    return this.auth.verifyMfaAndLogin(body.tenantSlug, body.challengeId, body.code, req.ip, req.headers['user-agent']);
  }

  /** WebAuthn equivalents of the two mfa endpoints above — same
   *  challengeId from login(), a passkey assertion instead of a TOTP
   *  code. See webauthn/webauthn.controller.ts for the (authenticated)
   *  enrollment side of this feature. */
  @Post('webauthn/login-options')
  async webauthnLoginOptions(@Body() body: { tenantSlug: string; challengeId: string }) {
    return this.auth.webauthnLoginOptions(body.tenantSlug, body.challengeId);
  }

  @Post('webauthn/login-verify')
  async webauthnLoginVerify(@Req() req: any, @Body() body: { tenantSlug: string; challengeId: string; response: any }) {
    return this.auth.verifyWebauthnAndLogin(
      body.tenantSlug,
      body.challengeId,
      body.response,
      req.ip,
      req.headers['user-agent'],
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: any) {
    return req.user;
  }

  /** Sub-tenant isolation (docs/FEATURES.md §11.1) — governed cross-division
   *  access. 'owner'-only: this mints a real access token into another
   *  tenant's data, one step above the 'owner'/'admin' bar every other
   *  admin action in this controller uses. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Post('sub-tenants/:id/access')
  async accessSubTenant(@Req() req: any, @Param('id') id: string) {
    return this.auth.accessSubTenant(
      { userId: req.user.sub, tenantId: req.user.tenant_id, email: req.user.email, displayName: req.user.email },
      id,
      req.ip,
      req.headers['user-agent'],
    );
  }
}
