import { Controller, ForbiddenException, Get, Headers, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuditService } from './audit.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/** Read path services/compliance's SIEM export trigger calls — see
 *  triggerExportNow in siem-export.service.ts, which was written against
 *  this endpoint before it existed and logged "deferred" until now. */
@Controller('audit-log')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any, @Query('limit') limit?: string) {
    return this.audit.list(req.user.tenant_id, limit ? Number(limit) : undefined);
  }

  /** Internal, service-to-service — the SIEM export delivery worker
   *  (docs/FEATURES.md §11.1, services/compliance's SiemExportService)
   *  runs on a scheduler tick with no end-user request/JWT to attach, so
   *  it can't use the JwtAuthGuard-gated route above. Same trust model as
   *  every other internal/* endpoint in this build: a shared secret
   *  header, `tenantId` passed explicitly since there's no session to
   *  derive it from. Registered ABOVE no path-param routes exist here to
   *  conflict with, but kept the same "internal/..." naming convention
   *  regardless. */
  @Get('internal')
  listInternal(@Headers('x-internal-secret') secret: string | undefined, @Query('tenantId') tenantId: string, @Query('limit') limit?: string) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    return this.audit.list(tenantId, limit ? Number(limit) : undefined);
  }

  /** Re-walks and re-hashes the tenant's entire chain — proof the
   *  append-only convention is actually enforced, not just documented.
   *  No @Roles restriction beyond the base JwtAuthGuard: any authenticated
   *  member of the tenant can ask "has our audit trail been tampered
   *  with", same as list() above. */
  @UseGuards(JwtAuthGuard)
  @Get('verify')
  verify(@Req() req: any) {
    return this.audit.verifyChain(req.user.tenant_id);
  }
}
