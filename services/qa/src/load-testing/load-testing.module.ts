import { Module } from '@nestjs/common';
import { LoadTestingService } from './load-testing.service';
import { LoadTestingController } from './load-testing.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [LoadTestingService],
  controllers: [LoadTestingController],
})
export class LoadTestingModule {}
