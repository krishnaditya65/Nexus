import { Module } from '@nestjs/common';
import { ContractorInvoicesService } from './contractor-invoices.service';
import { ContractorInvoicesController } from './contractor-invoices.controller';

@Module({
  providers: [ContractorInvoicesService],
  controllers: [ContractorInvoicesController],
})
export class ContractorInvoicesModule {}
