// Wires test-plans's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { TestPlansService } from './test-plans.service';
import { TestPlansController } from './test-plans.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [TestPlansService],
  controllers: [TestPlansController],
  exports: [TestPlansService],
})
export class TestPlansModule {}
