import { Module } from '@nestjs/common';
import { ReleasesService } from './releases.service';
import { ReleasesController } from './releases.controller';
import { AuthModule } from '../auth/auth.module';
import { ProjectGuestGuard } from '../auth/project-guest.guard';
import { ProjectsModule } from '../projects/projects.module';

@Module({
  imports: [AuthModule, ProjectsModule],
  providers: [ReleasesService, ProjectGuestGuard],
  controllers: [ReleasesController],
})
export class ReleasesModule {}
