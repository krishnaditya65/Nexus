// Wires subscriptions's provider/controller into the Nest DI graph — no
// business logic of its own; see subscriptions.service.ts for that.
import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsController } from './subscriptions.controller';
import { AuthModule } from '../auth/auth.module';
import { QueriesModule } from '../queries/queries.module';

@Module({
  imports: [AuthModule, QueriesModule],
  providers: [SubscriptionsService],
  controllers: [SubscriptionsController],
})
export class SubscriptionsModule {}
