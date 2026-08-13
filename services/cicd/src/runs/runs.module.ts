// Wires runs's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { RunsService } from './runs.service';
import { RunsController } from './runs.controller';
import { RunnerService } from './runner.service';
import { AuthModule } from '../auth/auth.module';
import { PipelinesModule } from '../pipelines/pipelines.module';
import { LibraryModule } from '../library/library.module';
import { RunnersModule } from '../runners/runners.module';

@Module({
  imports: [AuthModule, PipelinesModule, LibraryModule, RunnersModule],
  providers: [RunsService, RunnerService],
  controllers: [RunsController],
})
export class RunsModule {}
