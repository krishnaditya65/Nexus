// Wires problems's provider/controller into the Nest DI graph — no
// business logic of its own; see problems.service.ts for that.
import { Module } from '@nestjs/common';
import { ProblemsService } from './problems.service';
import { ProblemsController } from './problems.controller';

@Module({
  providers: [ProblemsService],
  controllers: [ProblemsController],
})
export class ProblemsModule {}
