import { Body, Controller, ForbiddenException, Headers, Post, Query } from '@nestjs/common';
import { BackupService } from './backup.service';

/** Internal, service-to-service surface — services/compliance calls this
 *  to actually take/verify a backup of the tenant's 'tickets' data class
 *  against the DR policy registry (docs/FEATURES.md §11.1/§0). Same
 *  trust model as comms' internal/retention/purge-messages and every
 *  other internal/* controller in this build. */
@Controller('internal/backup')
export class BackupInternalController {
  constructor(private readonly backup: BackupService) {}

  private assertTrustedCaller(secretHeader: string | undefined) {
    const expected = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';
    if (secretHeader !== expected) throw new ForbiddenException('untrusted caller');
  }

  @Post('export-tickets')
  exportTickets(@Headers('x-internal-secret') secret: string | undefined, @Query('tenantId') tenantId: string) {
    this.assertTrustedCaller(secret);
    return this.backup.exportTickets(tenantId);
  }

  @Post('verify-restore-tickets')
  verifyRestore(
    @Headers('x-internal-secret') secret: string | undefined,
    @Body() body: { tenantId: string; rows: any[] },
  ) {
    this.assertTrustedCaller(secret);
    return this.backup.verifyRestore(body.tenantId, body.rows);
  }
}
