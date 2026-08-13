import { Module } from '@nestjs/common';
import { RunnersController } from './runners.controller';
import { RunnersService } from './runners.service';
import { RunnerTokenGuard } from './runner-token.guard';
import { JobBrokerService } from './job-broker.service';

@Module({
  controllers: [RunnersController],
  providers: [RunnersService, RunnerTokenGuard, JobBrokerService],
  exports: [JobBrokerService, RunnersService],
})
export class RunnersModule {}
