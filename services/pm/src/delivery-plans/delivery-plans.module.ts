import { Module } from '@nestjs/common';
import { DeliveryPlansService } from './delivery-plans.service';
import { DeliveryPlansController } from './delivery-plans.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [DeliveryPlansService],
  controllers: [DeliveryPlansController],
})
export class DeliveryPlansModule {}
