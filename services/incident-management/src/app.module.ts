// incident-management service — incidents, severity, timeline, postmortems,
// public status page, and Problem Management (§13.7 — root-cause tracking
// as a workflow distinct from incident response; see ProblemsService's
// docblock for how it relates to incidents/postmortems).
import { Module } from '@nestjs/common';
import { IncidentsModule } from './incidents/incidents.module';
import { StatusPageModule } from './status-page/status-page.module';
import { ProblemsModule } from './problems/problems.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [IncidentsModule, StatusPageModule, ProblemsModule, HealthModule],
})
export class AppModule {}
