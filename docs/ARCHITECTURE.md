# Nexus — Architecture & Tech Stack (agreed)

## Decisions locked for this build

| Concern | Choice | Why |
|---|---|---|
| Default backend runtime | **Node.js / NestJS (TypeScript)** | One runtime for all CRUD-heavy domain services (auth, PM, comms, BI) — fastest iteration, one hiring pool, one observability setup. |
| Perf-critical / systems services | **Go** | Git hosting (smart-HTTP protocol, pack files), CI runner orchestrator. Only exception to the Node default — justified by raw throughput + concurrency needs. |
| Frontend | **Next.js (App Router) + Zustand + TanStack Query** | Zustand for local UI state, TanStack Query for server-state caching (don't hand-roll GraphQL cache invalidation). |
| Realtime collab | **Yjs + y-websocket** (own stateful service, not bundled into API pods) | |
| Primary DB | **PostgreSQL**, tenant_id + RLS on every table | Single cluster now; Citus/sharding trigger point documented, not built prematurely. |
| Event backbone | **Kafka** (Redpanda in dev for lighter footprint) | Durable, replayable — required for audit log and automation triggers, unlike Redis Pub/Sub which is fire-and-forget. |
| Ephemeral fanout | **Redis Pub/Sub** | Chat/presence typing indicators only — not audit-critical. |
| Analytics/logs | **ClickHouse** | |
| Object storage | **MinIO (S3-compatible)** locally, S3 in prod | Git LFS, recordings, docs. |
| Search | **OpenSearch** (planned) | Code-to-chat semantic search index. |
| Auth | **JWT (RS256) + refresh tokens**, tenant claim embedded | SSO/SCIM federate into this, don't replace it. |
| Monorepo tooling | **Turborepo + pnpm workspaces** | |
| Containerization | **Docker Compose (dev)** → Kubernetes (prod, not built yet) | |

## Why not the full original polyglot (Java + Go + Node)

Running three backend languages from day one triples deploy pipelines, observability instrumentation, and hiring surface before a single feature ships. Java is dropped unless/until there's a specific transactional-finance requirement Node genuinely can't satisfy — revisit at BI/Financials build-out.

## Multi-tenancy model

- Every domain table carries `tenant_id uuid not null`.
- Postgres RLS policy `USING (tenant_id = current_setting('app.tenant_id', true)::uuid)` on every table, plus `ALTER TABLE ... FORCE ROW LEVEL SECURITY`.
- Each request sets `app.tenant_id` via `SET LOCAL` inside the transaction, derived from the verified JWT — application code cannot bypass this by forgetting a `WHERE` clause.
- **The role split is load-bearing, not decorative.** `FORCE ROW LEVEL SECURITY` alone does nothing if the connecting role is a superuser — Postgres exempts superusers from RLS unconditionally, and `POSTGRES_USER` in the stock Postgres Docker image *is* a superuser. Every service's runtime pool connects as `eos_app` (plain login role, owns nothing, not superuser); migrations run as `eos` (the owner/superuser) and never serve traffic. See `infra/docker/postgres-init/01-roles-and-databases.sql`.
- **One Postgres database per service**, not one shared `eos` database — `eos_auth`, `eos_pm`, `eos_identity`, `eos_compliance`, `eos_billing`, `eos_apiplatform`, `eos_notifications`, `eos_incidents`, `eos_warehouse`, `eos_onboarding` — so a migration or table-name collision in one domain can't touch another's.
- **Pre-auth lookups** (an SSO login redirect, an SCIM call, an API-key-authenticated request, the public status page) resolve their tenant *from* a credential the caller presents, before `app.tenant_id` can be set — a raw `SELECT` under FORCE RLS would silently return zero rows. These go through narrow `SECURITY DEFINER` SQL functions instead (e.g. `resolve_scim_token`, `resolve_api_key`, `lookup_enabled_oidc_login`, `get_public_status_page`) that run as the owning role and return only the columns that specific auth step needs.
- Sub-tenants (future): same column, hierarchical closure table for tenant tree.

## Subdomain-based tenant routing

`{tenantSlug}.<baseDomain>` (e.g. `acme.nexus.app`) is the addressing scheme
for `apps/web`, reusing `tenants.slug` — no separate "subdomain" concept.

**This is a routing/UX layer, not the isolation boundary.** The subdomain a
browser happens to be on proves nothing to the backend about which tenant a
request may act on; a request is scoped to a tenant by the verified JWT's
`tenant_id` claim and enforced by Postgres `FORCE ROW LEVEL SECURITY`
(above), full stop. Getting this distinction wrong — treating the hostname
as an auth boundary — is a well-known multi-tenant SaaS mistake; this
platform doesn't make it. The subdomain only decides *what the visitor sees
before they're authenticated*.

Pre-auth flow the frontend drives against two existing public endpoints:
1. Extract the leftmost label of `window.location.hostname` as `tenantSlug`.
2. `GET services/auth/tenants/resolve/:subdomain` — 404 → render "workspace
   not found"; 200 → tenant exists, returns `{ slug, displayName }` for
   branding the login screen.
3. `GET services/identity-federation/sso/:tenantSlug/available` — `{
   ssoEnabled: true }` → redirect straight into
   `services/identity-federation/sso/:tenantSlug/login`; `false` → render
   the password form, posting to `services/auth`'s `POST /auth/login` with
   that same `tenantSlug`.

Both lookups are deliberately unauthenticated (same category as the SSO
login redirect itself) since the visitor has no session yet to check them
against, and return nothing beyond what's already public in every login
URL (the slug) or already the point of the endpoint (whether SSO exists).

Infra requirements once `apps/web` exists to serve, not yet provisioned:
a wildcard DNS record (`*.nexus.app` → the frontend's ingress) and a wildcard
TLS certificate. No application code depends on either being real for
local dev — every service defaults to `localhost:<port>`.

Evaluated and deliberately not adopted for this: **Keycloak** (would
duplicate `services/identity-federation`'s SCIM 2.0 + OIDC SSO, which
already covers the same ground) and **Casbin** (would duplicate
`Roles`/`RolesGuard`, the platform's existing RBAC primitive — worth
revisiting specifically when the "RBAC past role-level" roadmap item
needs policy-as-code, not as a wholesale replacement of what already
works).

## Service map

```
nexus/
  apps/
    web/                    Next.js frontend (all domains)                    [NOT STARTED]
  packages/
    rate-limiter/           Redis token-bucket, shared across every service   [BUILT]
  services/
    auth/                    NestJS — tenants, users, JWT, internal federation hooks [BUILT]
    identity-federation/     NestJS — SCIM 2.0 + OIDC SSO                     [BUILT]
    onboarding/              NestJS — device/license provisioning, HR sync    [BUILT]
    compliance/              NestJS — data residency, DR policy, data export, SIEM config [BUILT]
    billing/                 NestJS — plans, subscriptions, usage metering, invoices [BUILT]
    api-platform/            NestJS — API keys, webhook subscriptions + delivery [BUILT]
    notifications/           NestJS — web push subscriptions + send           [BUILT]
    incident-management/     NestJS — incidents, postmortems, status page     [BUILT]
    data-warehouse-sync/     NestJS — reverse-ETL export registry             [BUILT]
    pm/                      NestJS — tickets, workflows, projects (rate-limited) [BUILT]
    git-host/                Go — smart-HTTP git server, repos                [BUILT: minimal]
    comms/                   NestJS — chat channels, messages                 [SCAFFOLDED]
    cicd/                    Go — pipeline orchestration                      [SCAFFOLDED]
    qa/                      NestJS — test plans/runs                        [SCAFFOLDED]
    bi/                      NestJS — time tracking (superseded by services/billing for the financial half) [SCAFFOLDED]
    ai-platform/             NestJS — embeddings, search, triage             [SCAFFOLDED]
  infra/
    docker/                  docker-compose.yml — postgres, redis, kafka(redpanda), clickhouse, minio
    docker/postgres-init/    eos_app role + per-service database bootstrap (first-boot only)
```

Every `[BUILT]` NestJS service follows one skeleton: `src/db/pool.ts` (tenant-scoped Postgres pool, `eos_app`), `src/db/migrate.ts` (forward-only migration runner, `eos` owner), `src/auth/` (JWT verification guard, copied not reinvented), one `migrations/001_init.sql` per service. Copy that skeleton for any new service rather than inventing a new one.

## Local dev

```
cd infra/docker && docker compose up -d      # first boot also runs postgres-init/*.sql
cd services/auth && npm install && npm run migrate && npm run start:dev
cd services/pm   && npm install && npm run migrate && npm run start:dev
cd services/git-host && go mod tidy && go run ./cmd/server
# repeat npm install/migrate/start:dev per BUILT NestJS service — each owns its
# own database (eos_<service>), so migrations are independent and any order works
```
