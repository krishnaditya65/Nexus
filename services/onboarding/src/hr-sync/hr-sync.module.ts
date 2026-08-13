// Wires hr-sync's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { HrSyncController } from './hr-sync.controller';
import { OnboardingModule } from '../onboarding/onboarding.module';

@Module({
  imports: [OnboardingModule],
  controllers: [HrSyncController],
})
export class HrSyncModule {}
