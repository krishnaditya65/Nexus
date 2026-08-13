import { Controller, ForbiddenException, Get, Headers, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { DrBackupService } from './dr-backup.service';

const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

@Controller('dr-backup')
export class DrBackupController {
  constructor(private readonly drBackup: DrBackupService) {}

  // Taking a backup and running a restore-verify both touch real backend
  // resources (a network call to pm, disk I/O) — same owner/admin tier as
  // every other DR/security-posture action in this build.
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('tickets')
  takeTicketsBackup(@Req() req: any) {
    return this.drBackup.takeTicketsBackup(req.user.tenant_id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('tickets')
  listBackupRuns(@Req() req: any) {
    return this.drBackup.listBackupRuns(req.user.tenant_id, 'tickets');
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('owner', 'admin')
  @Post('tickets/verify-restore')
  verifyRestore(@Req() req: any) {
    return this.drBackup.verifyLatestTicketsRestore(req.user.tenant_id);
  }

  /** Internal, service-to-service — services/notifications's
   *  SchedulerService calls this on a cron tick. */
  @Post('internal/run-due')
  runDueInternal(@Headers('x-internal-secret') secret: string | undefined) {
    if (secret !== INTERNAL_SECRET) throw new ForbiddenException('untrusted caller');
    return this.drBackup.runDueBackups();
  }
}
