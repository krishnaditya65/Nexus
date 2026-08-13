import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { BackupPoliciesService } from './backup-policies.service';

@UseGuards(JwtAuthGuard)
@Controller('backup-policies')
export class BackupPoliciesController {
  constructor(private readonly backupPolicies: BackupPoliciesService) {}

  // Everything below except `list` sets or attests to the tenant's
  // disaster-recovery posture (RPO/RTO commitments, restore verification
  // records) — admin-only, same reasoning as data-residency policy above.
  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('seed-defaults')
  seedDefaults(@Req() req: any) {
    return this.backupPolicies.seedDefaults(req.user.tenant_id);
  }

  @Get()
  list(@Req() req: any) {
    return this.backupPolicies.list(req.user.tenant_id);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post()
  upsert(
    @Req() req: any,
    @Body()
    body: {
      dataClass: string;
      rpoMinutes: number;
      rtoMinutes: number;
      frequency: string;
      retentionDays: number;
    },
  ) {
    return this.backupPolicies.upsert(
      req.user.tenant_id,
      body.dataClass,
      body.rpoMinutes,
      body.rtoMinutes,
      body.frequency,
      body.retentionDays,
    );
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('verified-restore')
  recordVerifiedRestore(@Req() req: any, @Body() body: { dataClass: string }) {
    return this.backupPolicies.recordVerifiedRestore(req.user.tenant_id, body.dataClass);
  }

  @UseGuards(RolesGuard)
  @Roles('owner', 'admin')
  @Post('enforce-retention')
  enforceRetention(@Req() req: any, @Body() body: { dataClass: string }) {
    return this.backupPolicies.enforceRetention(req.user.tenant_id, body.dataClass, req.headers.authorization);
  }

  @Get('purge-runs')
  listPurgeRuns(@Req() req: any, @Query('dataClass') dataClass: string) {
    return this.backupPolicies.listPurgeRuns(req.user.tenant_id, dataClass);
  }
}
