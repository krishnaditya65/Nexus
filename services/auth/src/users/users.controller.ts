import { Body, Controller, ForbiddenException, Get, Headers, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UsersService } from './users.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Req() req: any) {
    return this.users.list(req.user.tenant_id);
  }

  /** Internal, service-to-service — services/notifications's EmailService
   *  calls this to resolve a user id into a send-to address (there's no
   *  end-user JWT for a cron-driven digest send to attach). Same trust
   *  model as every other internal/* endpoint in this build: a shared
   *  secret header, never exposed to a browser. Returns only email +
   *  display_name — never password_hash/role/custom_role_id. */
  @Get('internal/:tenantId/:userId/email')
  async internalEmail(
    @Headers('x-internal-secret') secret: string | undefined,
    @Param('tenantId') tenantId: string,
    @Param('userId') userId: string,
  ) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    const user = await this.users.findById(tenantId, userId);
    if (!user) return null;
    return { email: user.email, displayName: user.display_name };
  }

  /** Bootstrap endpoint: creates the first user for a freshly created tenant,
   *  as 'owner' — the only way any user ever becomes owner/admin, since
   *  `invite` (below) is itself gated to owner/admin and `create`'s default
   *  role is 'member'. Without this, a freshly created tenant would have no
   *  path to an owner at all and every RBAC-gated route in the platform
   *  (here and in pm/billing/compliance) would be permanently unreachable —
   *  caught live via Track 0 infra verification, see docs/ROADMAP.md.
   *  Real onboarding (SCIM, invites, RBAC-gated creation) replaces this —
   *  tracked as 🟡 in FEATURES.md. */
  @Post('bootstrap')
  async bootstrap(
    @Body()
    body: {
      tenantId: string;
      email: string;
      password: string;
      displayName: string;
    },
  ) {
    return this.users.create(
      body.tenantId,
      body.email,
      body.password,
      body.displayName,
      'owner',
    );
  }

  // First real RBAC enforcement point in the platform: only owner/admin can
  // invite users into a tenant. Order matters — JwtAuthGuard populates
  // req.user before RolesGuard reads req.user.role.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('invite')
  async invite(
    @Req() req: any,
    @Body() body: { email: string; password: string; displayName: string },
  ) {
    // Scoped to the inviting admin's own tenant via the verified JWT —
    // never trusts a tenantId from the request body post-login.
    return this.users.create(
      req.user.tenant_id,
      body.email,
      body.password,
      body.displayName,
    );
  }

  /** §12.7 — invites a user scoped to exist for ONE project, not the
   *  whole tenant. This endpoint only creates the account with
   *  `is_guest = true`; actually scoping them to a project is a separate
   *  call to services/pm's `POST /projects/:id/members` (decoupled the
   *  same way sessions/webauthn are separate calls rather than one
   *  atomic cross-service transaction — see that endpoint's docblock). A
   *  guest who is never added to any project can log in but sees an
   *  empty project list, same fail-closed default as an unconfigured
   *  RBAC route elsewhere in this platform. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('invite-guest')
  async inviteGuest(
    @Req() req: any,
    @Body() body: { email: string; password: string; displayName: string },
  ) {
    return this.users.create(req.user.tenant_id, body.email, body.password, body.displayName, 'member', true);
  }

  // Owner-only, not admin — see UsersService.setRole's docblock for why
  // role changes are the one action even an admin shouldn't grant.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Patch(':id/role')
  async setRole(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { role: 'owner' | 'admin' | 'member' },
  ) {
    return this.users.setRole(req.user.tenant_id, id, body.role, req.user.sub);
  }

  /** Custom role builder (§11.1/§13.8) — assigns/clears the one custom
   *  role a user holds. Owner-only, same tier as setRole above. */
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner')
  @Patch(':id/custom-role')
  async setCustomRole(@Req() req: any, @Param('id') id: string, @Body() body: { customRoleId: string | null }) {
    return this.users.setCustomRole(req.user.tenant_id, id, body.customRoleId);
  }
}
