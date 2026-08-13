// Wires invoicing's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { InvoicingService } from './invoicing.service';
import { InvoicingController } from './invoicing.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [InvoicingService],
  controllers: [InvoicingController],
})
export class InvoicingModule {}
