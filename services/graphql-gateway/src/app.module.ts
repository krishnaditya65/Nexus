// graphql-gateway service — a single GraphQL endpoint composing pm's
// projects/tickets and auth's tenant users into one schema (docs/
// FEATURES.md §11.9; see resolvers/gateway.resolver.ts's docblock for
// how this differs from true Apollo Federation, which this deliberately
// is not).
import { Module } from '@nestjs/common';
import { GatewayModule } from './resolvers/gateway.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [GatewayModule, HealthModule],
})
export class AppModule {}
