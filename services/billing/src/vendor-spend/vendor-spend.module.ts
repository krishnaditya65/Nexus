import { Module } from '@nestjs/common';
import { VendorSpendService } from './vendor-spend.service';
import { VendorSpendController } from './vendor-spend.controller';

@Module({
  providers: [VendorSpendService],
  controllers: [VendorSpendController],
})
export class VendorSpendModule {}
