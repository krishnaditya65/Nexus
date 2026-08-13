// Wires roadmap's provider/controller into the Nest DI graph — no
// business logic of its own; see roadmap.service.ts / auto-schedule.ts.
import { Module } from '@nestjs/common';
import { RoadmapService } from './roadmap.service';
import { RoadmapController } from './roadmap.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [RoadmapService],
  controllers: [RoadmapController],
})
export class RoadmapModule {}
