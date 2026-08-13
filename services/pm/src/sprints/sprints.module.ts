// Sprints (iterations): planning, starting/completing with carryover, and
// the active-sprint board view. See SprintsService's docblock for the
// Jira/ADO parity gap this closes.
import { Module } from '@nestjs/common';
import { SprintsController } from './sprints.controller';
import { SprintsService } from './sprints.service';

@Module({
  controllers: [SprintsController],
  providers: [SprintsService],
})
export class SprintsModule {}
