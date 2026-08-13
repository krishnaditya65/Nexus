import { Module } from '@nestjs/common';
import { PipelinesModule } from './pipelines/pipelines.module';
import { RunsModule } from './runs/runs.module';
import { EnvironmentsModule } from './environments/environments.module';
import { DeploymentsModule } from './deployments/deployments.module';
import { FeatureFlagsModule } from './feature-flags/feature-flags.module';
import { LibraryModule } from './library/library.module';
import { RunnersModule } from './runners/runners.module';
import { HealthModule } from './health/health.module';

/**
 * cicd service — YAML pipeline definitions + a real Docker-container-based
 * runner, environments/deployments (promotion + approval gates over an
 * already-succeeded run, canary/blue-green rollout), freeze windows,
 * feature flags (per-environment targeting + percentage-based rollout),
 * and the Pipelines Library (variable groups, secure files, task groups —
 * see LibraryService's docblock; the runner resolves all three by name at
 * execute() time, not just storing config nobody reads). APM auto-rollback
 * and chaos triggers remain ⚪ — see docs/FEATURES.md.
 */
@Module({
  imports: [
    PipelinesModule,
    RunsModule,
    EnvironmentsModule,
    DeploymentsModule,
    FeatureFlagsModule,
    LibraryModule,
    RunnersModule, HealthModule],
})
export class AppModule {}
