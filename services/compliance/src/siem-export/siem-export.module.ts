// Wires siem-export's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { SiemExportService } from './siem-export.service';
import { SiemExportController } from './siem-export.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [SiemExportService],
  controllers: [SiemExportController],
})
export class SiemExportModule {}
