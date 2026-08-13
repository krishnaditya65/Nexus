// Deployments: promotes a succeeded pipeline run into an environment,
// gated by that environment's approval requirement and any active freeze
// window. See DeploymentsService's docblock for exact scope.
import { Module } from '@nestjs/common';
import { DeploymentsController } from './deployments.controller';
import { DeploymentsService } from './deployments.service';
import { EnvironmentsModule } from '../environments/environments.module';

@Module({
  imports: [EnvironmentsModule],
  controllers: [DeploymentsController],
  providers: [DeploymentsService],
})
export class DeploymentsModule {}
