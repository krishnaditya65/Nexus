import { Module } from '@nestjs/common';
import { TestPlansModule } from './test-plans/test-plans.module';
import { TestExecutionsModule } from './test-executions/test-executions.module';
import { RtmModule } from './rtm/rtm.module';
import { ExploratoryModule } from './exploratory/exploratory.module';
import { LoadTestingModule } from './load-testing/load-testing.module';
import { AccessibilityModule } from './accessibility/accessibility.module';
import { HealthModule } from './health/health.module';

/**
 * qa service — test plans/suites, Gherkin/BDD cases, JUnit ingestion,
 * flaky-test quarantine, the Requirement Traceability Matrix (Phase 1), and
 * charter-driven exploratory testing sessions (Phase 15) alongside scripted
 * test-plan cases.
 */
@Module({
  imports: [TestPlansModule, TestExecutionsModule, RtmModule, ExploratoryModule, LoadTestingModule, AccessibilityModule, HealthModule],
})
export class AppModule {}
