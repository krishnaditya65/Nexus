# cicd (Phase 1)

YAML pipeline definitions executed by a real Docker-container-based runner
— each step is `docker run --rm -v <workspace>:/workspace <image> sh -c
"<step>"`, not a simulated executor. Requires the Docker daemon to be
reachable from this service (see Dockerfile's docker-cli note and the
`/var/run/docker.sock` mount this implies in deployment).

## What's real

- `POST /pipelines`, `GET /pipelines` — YAML pipeline CRUD (`image` + `steps`).
- `POST /pipelines/:id/runs` — triggers a run: clones the repo from
  `git-host` using the caller's own JWT as the clone credential, runs each
  step as its own container, fail-fast on first non-zero exit.
- `GET /pipelines/:id/runs`, `GET /pipelines/:id/runs/:runId` — run + per-step
  status and captured logs.
- CI runner-minutes are reported to `services/billing`'s usage ledger
  (`ci_minutes` metric) after every run — the metering wiring
  `docs/ROADMAP.md` called out as pending is now real.

## What's not (⚪)

- Environment/release management (Dev/Staging/Prod gates).
- Canary/blue-green rollout strategies, APM-triggered auto-rollback.
- Native feature flags + A/B cohort assignment.
- Maintenance windows/freeze periods.
- Chaos engineering triggers.
- Webhook-driven triggers (`trigger_event_types` column and
  `findByTriggerEvent` exist; the actual subscription to
  `services/api-platform`'s webhook delivery isn't wired yet — a tenant
  would need to manually register this service's future ingest endpoint as
  a webhook target).
