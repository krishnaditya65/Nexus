// Wires dr-backup's provider/controller into the Nest DI graph — no
// business logic of its own; see dr-backup.service.ts for that.
import { Module } from '@nestjs/common';
import { DrBackupService } from './dr-backup.service';
import { DrBackupController } from './dr-backup.controller';

@Module({
  providers: [DrBackupService],
  controllers: [DrBackupController],
})
export class DrBackupModule {}
