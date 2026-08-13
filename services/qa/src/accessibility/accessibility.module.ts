import { Module } from '@nestjs/common';
import { AccessibilityService } from './accessibility.service';
import { AccessibilityController } from './accessibility.controller';

@Module({
  providers: [AccessibilityService],
  controllers: [AccessibilityController],
})
export class AccessibilityModule {}
