# graphql-gateway

A single GraphQL endpoint (`POST /graphql`, with introspection/playground
on) composing `pm`'s projects/tickets and `auth`'s tenant users into one
schema — the platform's first GraphQL surface, previously flagged in
docs/FEATURES.md as "every service is plain REST today."

**This is a GATEWAY, not true Apollo Federation.** Real federation means
every one of this platform's 17 services defining its own `@key`-annotated
subgraph schema and running a federation-aware server — a change to all 17
services. This is the honestly-scoped first slice: one new service whose
resolvers call a few real, high-value REST endpoints and compose their
results. See `src/resolvers/gateway.resolver.ts`'s docblock for the full
design rationale, including the disclosed N+1 query pattern (no DataLoader
batching this pass).

Every resolver forwards the CALLER's own bearer token to each downstream
REST call — this gateway holds no credential of its own, and every
downstream service still independently authenticates/authorizes exactly
as it would for a direct REST call.

## Example query

```graphql
query {
  tickets(projectId: "...") {
    id
    title
    stateName
    project { name }
    assignee { displayName }
  }
}
```
