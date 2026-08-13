import { Module } from '@nestjs/common';
import { NotificationSchemesController } from './notification-schemes.controller';
import { NotificationSchemesService } from './notification-schemes.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [NotificationSchemesController],
  providers: [NotificationSchemesService],
  exports: [NotificationSchemesService],
})
export class NotificationSchemesModule {}
