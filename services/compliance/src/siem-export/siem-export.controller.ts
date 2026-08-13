import { Body, Controller, ForbiddenException, Get, Headers, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { SiemExportService } from './siem-export.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

@Controller('siem-exports')
export class SiemExportController {
  constructor(private readonly siemExport: SiemExportService) {}

  // Configuring or firing a SIEM export hands a security tool (and the
  // auth token accompanying it) the tenant's audit trail — admin-only.
  // `list` stays open: it deliberately never selects auth_token (see
  // SiemExportService.list), so it carries no secret to protect.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  upsert(
    @Req() req: any,
    @Body() body: { destination: 'splunk' | 'datadog'; endpointUrl: string; authToken: string },
  ) {
    return this.siemExport.upsertConfig(req.user.tenant_id, body.destination, body.endpointUrl, body.authToken);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Req() req: any) {
    return this.siemExport.list(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('trigger')
  trigger(@Req() req: any, @Body() body: { destination: 'splunk' | 'datadog' }) {
    return this.siemExport.triggerExportNow(req.user.tenant_id, body.destination, req.headers.authorization);
  }

  /** Internal, service-to-service — services/notifications's
   *  SchedulerService calls this on a cron tick to actually run the SIEM
   *  export delivery worker (docs/FEATURES.md §11.1). Same trust model
   *  as every other internal/* endpoint in this build. */
  @Post('internal/run-due')
  runDueInternal(@Headers('x-internal-secret') secret: string | undefined) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    return this.siemExport.runDue();
  }
}
