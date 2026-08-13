# Horizontal Scaling Story for Stateful Pieces

(docs/FEATURES.md §11.10 — "the CI runner shells out to local docker,
git-host writes to local disk, artifacts writes tarballs to local disk;
none of these are safe to run as more than one replica without a shared
volume or object-storage swap-in... there's no single doc tying all of
them together as one pre-multi-instance checklist.")

Every service in this platform is otherwise stateless (auth via JWT, no
server-side sessions, Postgres as the single source of truth per
tenant). The pieces below are the real exceptions — each one either
writes to local disk, holds state in a module-level variable, or
assumes the process handling request N is the same process that will
handle a later, related request. **Running any of these services as 2+
replicas today, without addressing the specific item, WILL cause real
failures** (a 404 on an OIDC callback, a call that never connects, a
pipeline run that hangs forever) — this is not a theoretical concern.

This is the single checklist several individual docblocks already
pointed at but never collected in one place. Each entry lists the real
failure mode and the real fix.

## Local-disk writes (need shared volume or object storage)

| Location | What it writes | Swap-in |
|---|---|---|
| `services/artifacts/src/packages/storage.ts` | Published npm package tarballs, under `ARTIFACTS_ROOT` (default `/tmp/nexus-artifacts`) | S3/GCS — already documented in-file as the intended swap-in |
| `services/comms/src/calls/storage.ts` | WebRTC call recordings, under `CALL_RECORDINGS_ROOT` | S3/GCS — already documented in-file |
| `services/compliance/src/dr-backup/storage.ts` | DR backup blobs, under `DR_BACKUPS_ROOT` | S3/GCS — already documented in-file |
| `services/compliance/src/data-export/data-export.service.ts` | Tenant "right to leave" data-export bundles, under `EXPORT_BUNDLE_DIR` | S3/GCS — **not previously documented as such**; added to this checklist here |
| `services/data-warehouse-sync/src/exports/exports.service.ts` | Exported ticket rows as JSON, under `WAREHOUSE_EXPORT_DIR` (the `s3_parquet` connector's actual local-disk stand-in) | A real warehouse connector (Snowflake/BigQuery SDK) or S3 |

**Failure mode**: a file written by the replica that handled the write
request is invisible to a different replica that later handles a read
request for it (e.g. downloading a tarball, replaying a backup) — a
real 404/ENOENT, not a subtle bug.

**Fix, same shape for all five**: swap each `storage.ts`'s local
`writeFileSync`/`readFileSync` pair for an S3-compatible client
(AWS SDK, or any S3-compatible object store) behind the exact same
function signature — every one of these files was written with that
swap-in as the explicit design intent, so the call sites (the services
above) need zero changes.

**Not a blocker**: `services/cicd/src/runs/runner.service.ts`'s
per-run `mkdtempSync` workspace is transient (created and
`rmSync`'d within one `execute()` call, never read by a later request)
— it doesn't need to survive across replicas, only across the container
steps of one run. `packages/cli/src/config.ts`'s `~/.nexus/config.json` is
a developer's local CLI credential file, not a server process — out of
scope entirely.

## In-memory state (need Redis or a real job queue)

| Location | What it holds | Failure mode if load-balanced across replicas |
|---|---|---|
| `services/identity-federation/src/sso/oidc-login.service.ts`'s `OidcLoginService.pendingLoginStates` | Pending OIDC `state` values between the auth-redirect and callback legs of login | The callback lands on a different replica than the one that issued the redirect → "Unknown or expired SSO login state" for a real, in-progress login. Already flagged in-file: "fine for a single instance; move to Redis before running more than one replica." |
| `services/cicd/src/runners/job-broker.service.ts`'s `JobBrokerService.pending`/`.authHeaders` | The in-process bridge between a pipeline step waiting on a BYO-runner job and that runner's later HTTP callback reporting completion | The runner's completion callback hits a different replica than the one waiting → the waiting step never resolves, the run hangs until its own timeout (if any) |
| `services/cicd/src/runs/runner.service.ts`'s `RunnerService.pendingApprovals` | The in-process pause point for a manual pipeline approval gate | The approve/reject decision (a separate, later HTTP request — a human clicking a button, arbitrarily far in the future) hits a different replica → `decideApproval` returns `false` for "unknown approval," the run hangs forever. Already flagged in-file: "a restart while a run is paused on approval loses the pause point" — the same root cause as a second replica. |

**Fix**: replace each `Map` with a Redis-backed equivalent — a Redis key
with a TTL for `pendingLoginStates` (matching its own already-added
expiry logic, see `oidc-state.ts`), and Redis pub/sub (or a real queue
like BullMQ, which this repo doesn't currently depend on) for the two
cicd broker/approval maps, since those need to wake up a *specific*
waiting request, not just check a value.

**Structural note for `services/cicd`**: `JobBrokerService` and
`RunnerService.pendingApprovals` combined mean a pipeline run is
effectively *pinned* to whichever replica started executing it, for the
run's entire lifetime — the Docker-daemon dependency below has the same
effect for a different reason. Fixing only one of the three (say, moving
just the approval map to Redis) doesn't unpin a run; all three need to
move together, or the runner architecture needs a sticky-routing layer
in front of it. This is a bigger, coupled change, not three independent
one-line fixes — flagged here rather than understated.

## Process-local external calls

| Location | What it assumes | Fix |
|---|---|---|
| `services/cicd/src/runs/runner.service.ts` (`docker run` via `child_process.spawn`) | The local Docker daemon is reachable from this process (`/var/run/docker.sock` mounted in) | Every replica needs its own Docker socket access — real, already documented (README's docker-compose caveat) — but combined with the in-memory maps above, a run still can't be resumed by a *different* replica's Docker daemon even once every replica has one |
| `services/git-host/internal/repos/repos.go` (`GIT_REPOS_ROOT`, default `/data/repos`) | Every bare repo lives on this process's local disk; `Create()`/`browse.go`/`pullrequests.go`'s worktree merges/`secretscan.go`/`codeowners.go` all shell out to the local `git` CLI against that same local path | A shared/networked filesystem (NFS/EFS-class) mounted identically on every replica, OR a per-tenant-repo routing layer (consistent hashing on `tenantID/repoName` to a specific replica) — this is git-host's single most fundamental scaling blocker, since literally every git operation in the service depends on it, and unlike the TS `storage.ts` files there was no existing swap-in comment for it before this doc |

## WebSocket / Socket.IO state

`services/comms`'s `ChatGateway` uses NestJS's default **in-memory**
Socket.IO adapter — `services/main.ts` never wires a
`@socket.io/redis-adapter` equivalent. This splits into two genuinely
different cases:

- **Chat messages are already safe**: `ChatGateway` bridges cross-replica
  delivery itself via Redis pub/sub (`redisSubscriber.psubscribe('chat:*:*')`
  → `this.server.to(channel).emit(...)`) — a message published by any
  replica reaches every replica's locally-connected sockets in the right
  channel. This works today, no change needed.
- **WebRTC call signaling — fixed.** `handleCallJoin`/`handleCallSignal`
  (the §11.6 mesh-topology relay) read `this.server.sockets.adapter.rooms`
  and target a specific `targetSocketId` directly. Before the fix below,
  both operated purely against Socket.IO's LOCAL adapter state, so two
  participants in the same call landing on different replicas would
  silently fail to signal each other. **Fix, applied**:
  `services/comms/src/redis-io.adapter.ts`'s `RedisIoAdapter` wraps
  `@socket.io/redis-adapter` over two `ioredis` connections and is wired
  in via `app.useWebSocketAdapter(...)` in `main.ts` — this makes room
  membership AND targeted-socket-id emits correctly cluster-aware with
  zero changes to `ChatGateway`'s own code (every socket auto-joins a
  room named after its own id, so a targeted emit is really just a
  to-room emit under the hood). The pre-existing hand-rolled Redis
  pub/sub bridge for chat messages (`messages.service.ts`'s
  `chatRedisChannel`) is now functionally redundant for that path but
  was deliberately left in place rather than removed in the same pass —
  removing already-correct, working code with no live infra to verify
  the removal against was judged a needless risk. **Not live-verified**:
  the fix compiles and the service starts correctly, but the actual
  cross-replica signaling path has never been exercised against two real
  comms processes and a real Redis instance (no Docker this pass).

## What's already fine

Every other service is stateless: JWT verification against auth's real
JWKS endpoint needs no shared session store; every Postgres write goes
through `withTenant()`'s per-request connection, no server-held
transaction spans requests; `services/notifications`'s scheduler
(`@Cron`) would fire redundantly once per replica if load-balanced,
which is wasteful but not *incorrect* (every consumer's `run-due`
pattern is idempotent-safe — a subscription/automation/backup that's
already been run this period is simply skipped on the next tick,
including a concurrent one from a second replica) — a real efficiency
gap worth a leader-election guard eventually, but not a correctness
blocker like everything above.

## Verification status

This is a documentation-only deliverable — no code changed to produce
it. The inventory above was compiled by grep/read across the real
codebase, not written from memory or assumption; the WebRTC
signaling gap was newly discovered while compiling this doc (no prior
comment flagged it) and is disclosed here for the first time rather than
silently left for a future scaling attempt to discover the hard way.
