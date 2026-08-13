// Wires onboarding's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { OnboardingWorkflowsService } from './onboarding-workflows.service';
import { OnboardingController } from './onboarding.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [OnboardingWorkflowsService],
  controllers: [OnboardingController],
  exports: [OnboardingWorkflowsService],
})
export class OnboardingModule {}
