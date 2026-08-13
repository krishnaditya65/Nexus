// onboarding service — device/license provisioning tasks, Workday/BambooHR
// webhook ingestion, offboarding, and a real Asset Management / CMDB
// registry (§13.7 — see AssetsService's docblock for how it differs from
// the provisioning-task event logs above).
import { Module } from '@nestjs/common';
import { OnboardingModule } from './onboarding/onboarding.module';
import { HrSyncModule } from './hr-sync/hr-sync.module';
import { AssetsModule } from './assets/assets.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [OnboardingModule, HrSyncModule, AssetsModule, HealthModule],
})
export class AppModule {}
