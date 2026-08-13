// Wires the gateway resolver into the Nest DI graph — no business logic
// of its own; see gateway.resolver.ts for that.
import { Module } from '@nestjs/common';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { GatewayResolver } from './gateway.resolver';

@Module({
  imports: [
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: true, // code-first — schema.gql generated from the @ObjectType/@Resolver decorators in this module
      context: ({ req }: any) => ({ req }),
      // Introspection/playground on in every environment — this gateway
      // holds no credentials of its own (every field resolver forwards
      // the caller's real bearer token, rest-client.ts's docblock), so
      // exposing the schema shape isn't a new information disclosure;
      // the actual data access is still gated per-field by whatever
      // downstream REST call a resolver makes.
      introspection: true,
    }),
  ],
  providers: [GatewayResolver],
})
export class GatewayModule {}
