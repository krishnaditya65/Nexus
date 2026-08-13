// Wires backup-policies's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { BackupPoliciesService } from './backup-policies.service';
import { BackupPoliciesController } from './backup-policies.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [BackupPoliciesService],
  controllers: [BackupPoliciesController],
})
export class BackupPoliciesModule {}
