// Kanban/Scrum board: column grouping over workflow states + WIP limits.
// See BoardsService's docblock for how a column relates to a workflow
// state and why they're modeled separately.
import { Module } from '@nestjs/common';
import { BoardsController } from './boards.controller';
import { BoardsService } from './boards.service';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [BoardsController],
  providers: [BoardsService, ProjectGuestGuard],
})
export class BoardsModule {}
