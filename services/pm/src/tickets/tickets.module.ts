// Wires tickets's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { TicketsService } from './tickets.service';
import { TicketsController } from './tickets.controller';
import { AuthModule } from '../auth/auth.module';
import { AutomationsModule } from '../automations/automations.module';
import { ProjectsModule } from '../projects/projects.module';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { CustomFieldsModule } from '../custom-fields/custom-fields.module';
import { NotificationSchemesModule } from '../notification-schemes/notification-schemes.module';

@Module({
  imports: [AuthModule, AutomationsModule, ProjectsModule, CustomFieldsModule, NotificationSchemesModule],
  providers: [TicketsService, ProjectGuestGuard],
  controllers: [TicketsController],
  exports: [TicketsService],
})
export class TicketsModule {}
