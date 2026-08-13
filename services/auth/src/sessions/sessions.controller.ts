import { Body, Controller, Delete, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SessionsService } from './sessions.service';

@UseGuards(JwtAuthGuard)
@Controller('sessions')
export class SessionsController {
  constructor(private readonly sessions: SessionsService) {}

  // Every session for the CALLING user only — self-service, not an admin
  // view of other users' sessions (that would be a separate, RBAC-gated
  // feature). Marks which row is the request's own current session so a
  // UI can show "this device" distinctly.
  @Get()
  async list(@Req() req: any) {
    const rows = await this.sessions.listForUser(req.user.tenant_id, req.user.sub);
    return rows.map((r) => ({ ...r, isCurrent: r.id === req.user.sid }));
  }

  @Delete(':id')
  revoke(@Req() req: any, @Param('id') id: string) {
    return this.sessions.revoke(req.user.tenant_id, req.user.sub, id, 'revoked by user');
  }

  @Post('revoke-others')
  revokeOthers(@Req() req: any) {
    return this.sessions.revokeAllOthers(req.user.tenant_id, req.user.sub, req.user.sid);
  }
}
