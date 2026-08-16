# Nexus — Local Setup

This is the getting-started guide for running Nexus locally. For stack
rationale and multi-tenancy design see `ARCHITECTURE.md`; for what's
actually implemented per service see `FEATURES.md`.

## Prerequisites

| Tool | Version | Why |
|---|---|---|
| Node.js | **20.x** | Matches `node:20-alpine` used in every service's `Dockerfile`. No `.nvmrc`/`engines` field is committed yet — pin to 20 by convention until one is added. |
| pnpm | **9.7.0** | Pinned via `"packageManager"` in root `package.json`. Enable via `corepack enable`. |
| Docker + Docker Compose | recent | Runs the dev infra stack (Postgres, Redis, Redpanda, ClickHouse, MinIO). |
| Go | **1.22** | Only needed if you're running/building `services/git-host`, the one non-Node service (matches `golang:1.22-alpine` in its `Dockerfile`). |

## 1. Install dependencies

```bash
cd projects/nexus
corepack enable          # if pnpm isn't already available
pnpm install              # installs all workspaces: apps/*, services/*, packages/*
```

## 2. Start infra (Postgres, Redis, Redpanda, ClickHouse, MinIO)

```bash
pnpm dev:infra
```

This runs `docker compose -f infra/docker/docker-compose.yml up -d`.

| Service | Image | Default host port | Purpose |
|---|---|---|---|
| postgres | `pgvector/pgvector:pg16` | 5432 | Primary DB (pgvector needed for `ai-platform` embedding search) |
| redis | `redis:7-alpine` | 6379 | Ephemeral pub/sub (chat/presence typing) |
| redpanda | `redpandadata/redpanda:v24.1.9` | 9092 | Kafka-compatible event backbone (dev stand-in for Kafka) |
| clickhouse | `clickhouse/clickhouse-server:24.3-alpine` | 8123 (HTTP), 9004 (native) | Analytics/logs |
| minio | `minio/minio:latest` | 9002 (API), 9001 (console) | S3-compatible object storage |

Ports can be overridden via `POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`,
`REDPANDA_HOST_PORT`, `CLICKHOUSE_HTTP_HOST_PORT`,
`CLICKHOUSE_NATIVE_HOST_PORT`, `MINIO_API_HOST_PORT`,
`MINIO_CONSOLE_HOST_PORT`.

**On first boot only**, Postgres runs
`infra/docker/postgres-init/01-roles-and-databases.sql`, which creates:

- The `eos_app` login role (password `eos_app_dev_password`) — every
  service's **runtime** connection must use this role, not the `eos`
  superuser, or Postgres Row-Level Security is silently bypassed (see
  `ARCHITECTURE.md`).
- One database per service: `eos_auth`, `eos_pm`, `eos_identity`,
  `eos_compliance`, `eos_billing`, `eos_apiplatform`, `eos_notifications`,
  `eos_incidents`, `eos_warehouse`, `eos_onboarding`, `eos_git`, `eos_cicd`,
  `eos_qa`, `eos_bi`, `eos_aiplatform`, `eos_comms`, `eos_artifacts`.

If you change the init SQL after the first boot, it won't re-run — wipe
the Postgres volume first (`pnpm dev:infra:down` then `docker volume rm`
the postgres volume, or `docker compose ... down -v`).

Dev-only baked-in credentials: Postgres superuser `eos` /
`eos_dev_password`, DB `eos`; MinIO `eos_admin` / `eos_dev_password`.

To stop the stack: `pnpm dev:infra:down`.

## 3. Configure environment variables

**There is no `.env.example` committed yet** — `.gitignore` already
carves out an exception for one (`!.env.example`), so create it at the
repo root and per-service as you wire things up. Each NestJS service
reads its own env at minimum:

**Per service (repeat for each of the 16 Node services, substituting its `eos_<service>` database):**

```bash
DATABASE_URL=postgres://eos_app:eos_app_dev_password@localhost:5432/eos_<service>
MIGRATION_DATABASE_URL=postgres://eos:eos_dev_password@localhost:5432/eos_<service>
PORT=<service-specific port>
```

`DATABASE_URL` must use `eos_app` (runtime, RLS-enforced);
`MIGRATION_DATABASE_URL` must use the `eos` superuser (migrations create
tables/RLS policies, which `eos_app` isn't privileged to do).

**Shared infra:**

```bash
REDIS_URL=redis://localhost:6379
KAFKA_BROKERS=localhost:9092
OTEL_EXPORTER_OTLP_ENDPOINT=<your OTel collector, if running one>
```

**Inter-service URLs** (each service calling another over HTTP):

```
AI_PLATFORM_SERVICE_URL, API_PLATFORM_SERVICE_URL, AUTH_SERVICE_URL,
BILLING_SERVICE_URL, BI_SERVICE_URL, COMMS_SERVICE_URL,
COMPLIANCE_SERVICE_URL, GIT_HOST_URL, NOTIFICATIONS_SERVICE_URL,
PM_SERVICE_URL, EOS_API_PLATFORM_URL, EOS_AUTH_URL, EOS_PM_URL
```

**Auth / security:**

```
EOS_KMS_MASTER_KEY, INTERNAL_SERVICE_SECRET, WEBAUTHN_RP_ID,
WEBAUTHN_RP_ORIGIN, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
```

**Email** (`comms`/`notifications`):

```
SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS, SMTP_FROM
```

**AI platform** (embeddings):

```
EMBEDDING_API_KEY, EMBEDDING_API_URL, EMBEDDING_MODEL
```

**Local storage roots** (see `HORIZONTAL_SCALING.md` — these are
single-node-only until moved to shared/object storage):

```
ARTIFACTS_ROOT, CALL_RECORDINGS_ROOT, DR_BACKUPS_ROOT,
EXPORT_BUNDLE_DIR, WAREHOUSE_EXPORT_DIR, GIT_REPOS_ROOT (git-host, Go)
```

**Frontend** (`apps/web`) — one `NEXT_PUBLIC_*` URL per backend service,
e.g. `NEXT_PUBLIC_AUTH_SERVICE_URL`, `NEXT_PUBLIC_PM_SERVICE_URL`,
`NEXT_PUBLIC_GIT_HOST_SERVICE_URL`, etc. — mirror the non-public
`*_SERVICE_URL` list above with the `NEXT_PUBLIC_` prefix, plus
`NEXT_PUBLIC_ARTIFACTS_SERVICE_URL`, `NEXT_PUBLIC_CICD_SERVICE_URL`,
`NEXT_PUBLIC_DATA_WAREHOUSE_SYNC_SERVICE_URL`,
`NEXT_PUBLIC_GRAPHQL_GATEWAY_SERVICE_URL`,
`NEXT_PUBLIC_IDENTITY_FEDERATION_SERVICE_URL`,
`NEXT_PUBLIC_INCIDENT_MANAGEMENT_SERVICE_URL`,
`NEXT_PUBLIC_ONBOARDING_SERVICE_URL`, `NEXT_PUBLIC_QA_SERVICE_URL`.

## 4. Run database migrations

Each NestJS service owns its migrations independently, so order doesn't
matter:

```bash
cd services/auth && pnpm migrate
cd services/pm   && pnpm migrate
# repeat for every service you plan to run
```

`git-host` (Go) doesn't use this migration runner — see its own README.

## 5. Run the services

**Everything at once** (Turborepo, parallel):

```bash
pnpm dev
```

**One service at a time**, e.g. while iterating on `auth`:

```bash
cd services/auth && pnpm start:dev
```

**The Go service:**

```bash
cd services/git-host && go mod tidy && go run ./cmd/server
```

**Frontend only:**

```bash
cd apps/web && pnpm start:dev   # next dev
```

## 6. Build & test

```bash
pnpm build   # turbo run build, respects the workspace dependency graph
pnpm test    # turbo run test
```

## Minimum viable local setup

Not every service needs to run to develop against `auth` + `pm` (a
common inner loop): `pnpm dev:infra`, then bring up `auth`, `pm`, and
`apps/web`, migrating `auth` and `pm` first. Add other services as the
feature you're building needs them.

## Notes

- Root `README.md` and root `app.js` are placeholder stubs, not real
  entry points — ignore them.
- No production Kubernetes manifests exist yet (`infra/k8s` is empty);
  local dev is Docker Compose only. See `ARCHITECTURE.md`.
- Before running more than one replica of `git-host`, the CI runner, or
  `artifacts`, read `HORIZONTAL_SCALING.md` — they currently depend on
  local disk.
