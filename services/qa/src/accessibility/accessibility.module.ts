import { Module } from '@nestjs/common';
import { AccessibilityService } from './accessibility.service';
import { AccessibilityController } from './accessibility.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [AccessibilityService],
  controllers: [AccessibilityController],
})
export class AccessibilityModule {}
