// Wires test-executions's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { TestExecutionsService } from './test-executions.service';
import { TestExecutionsController } from './test-executions.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [TestExecutionsService],
  controllers: [TestExecutionsController],
})
export class TestExecutionsModule {}
