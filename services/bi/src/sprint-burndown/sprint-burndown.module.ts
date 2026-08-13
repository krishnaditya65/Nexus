// Wires sprint-burndown's provider/controller into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { SprintBurndownService } from './sprint-burndown.service';
import { SprintBurndownController } from './sprint-burndown.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [SprintBurndownService],
  controllers: [SprintBurndownController],
})
export class SprintBurndownModule {}
