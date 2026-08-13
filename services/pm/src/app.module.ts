// pm service — projects, tickets, configurable workflow state machine,
// dependency links, sprints/backlog ranking, Kanban/Scrum boards, Epic
// progress rollup, saved filters/queries, a project wiki, retrospectives,
// per-sprint team capacity planning, and widget-based dashboards (agile
// planning — see SprintsService's/BoardsService's/EpicsService's/
// QueriesService's/WikiService's/RetrospectivesService's/
// TeamPlannerService's/DashboardsService's docblocks for the Jira/ADO
// parity gaps each closes).
import { Module } from '@nestjs/common';
import { ProjectsModule } from './projects/projects.module';
import { TicketsModule } from './tickets/tickets.module';
import { SprintsModule } from './sprints/sprints.module';
import { BoardsModule } from './boards/boards.module';
import { EpicsModule } from './epics/epics.module';
import { QueriesModule } from './queries/queries.module';
import { WikiModule } from './wiki/wiki.module';
import { RetrospectivesModule } from './retrospectives/retrospectives.module';
import { TeamPlannerModule } from './team-planner/team-planner.module';
import { DashboardsModule } from './dashboards/dashboards.module';
import { DeliveryPlansModule } from './delivery-plans/delivery-plans.module';
import { TicketTemplatesModule } from './ticket-templates/ticket-templates.module';
import { ReleasesModule } from './releases/releases.module';
import { OkrsModule } from './okrs/okrs.module';
import { AutomationsModule } from './automations/automations.module';
import { ApprovalsModule } from './approvals/approvals.module';
import { FormsModule } from './forms/forms.module';
import { GoalsModule } from './goals/goals.module';
import { CustomFieldsModule } from './custom-fields/custom-fields.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { RoadmapModule } from './roadmap/roadmap.module';
import { BackupModule } from './backup/backup.module';
import { HealthModule } from './health/health.module';
import { VersionInfoModule } from './version-info/version-info.module';

@Module({
  imports: [
    ProjectsModule,
    TicketsModule,
    SprintsModule,
    BoardsModule,
    EpicsModule,
    QueriesModule,
    WikiModule,
    RetrospectivesModule,
    TeamPlannerModule,
    DashboardsModule,
    DeliveryPlansModule,
    TicketTemplatesModule,
    ReleasesModule,
    OkrsModule,
    AutomationsModule,
    ApprovalsModule,
    FormsModule,
    GoalsModule,
    CustomFieldsModule,
    SubscriptionsModule,
    RoadmapModule,
    BackupModule,
    HealthModule,
    VersionInfoModule,
  ],
})
export class AppModule {}
