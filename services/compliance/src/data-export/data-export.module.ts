// Wires data-export's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { DataExportService } from './data-export.service';
import { DataExportController } from './data-export.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [DataExportService],
  controllers: [DataExportController],
})
export class DataExportModule {}
