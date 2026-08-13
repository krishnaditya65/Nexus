// compliance service — data residency, DR/backup policy (RPO/RTO), tenant
// data export, SIEM export config + delivery worker, and now real DR
// backup/restore automation (§11.1/§0 — see dr-backup.service.ts's
// docblock for the one-data-class-real, rest-disclosed scope).
import { Module } from '@nestjs/common';
import { ResidencyModule } from './residency/residency.module';
import { BackupPoliciesModule } from './backup-policies/backup-policies.module';
import { DataExportModule } from './data-export/data-export.module';
import { SiemExportModule } from './siem-export/siem-export.module';
import { DrBackupModule } from './dr-backup/dr-backup.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ResidencyModule, BackupPoliciesModule, DataExportModule, SiemExportModule, DrBackupModule, HealthModule],
})
export class AppModule {}
