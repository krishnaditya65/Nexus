// Wires backup's provider/controller into the Nest DI graph — no business
// logic of its own; see backup.service.ts for that.
import { Module } from '@nestjs/common';
import { BackupService } from './backup.service';
import { BackupInternalController } from './backup-internal.controller';

@Module({
  providers: [BackupService],
  controllers: [BackupInternalController],
})
export class BackupModule {}
