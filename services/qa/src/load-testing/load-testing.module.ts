import { Module } from '@nestjs/common';
import { LoadTestingService } from './load-testing.service';
import { LoadTestingController } from './load-testing.controller';

@Module({
  providers: [LoadTestingService],
  controllers: [LoadTestingController],
})
export class LoadTestingModule {}
