// Project wiki — plain markdown text storage + CRUD. Real-time
// multi-cursor editing (Yjs) is the ambitious version tracked separately
// in docs/FEATURES.md; this is the "does a project have a place to write
// docs at all" first cut.
import { Module } from '@nestjs/common';
import { WikiController } from './wiki.controller';
import { WikiService } from './wiki.service';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [ProjectsModule],
  controllers: [WikiController],
  providers: [WikiService, ProjectGuestGuard],
})
export class WikiModule {}
