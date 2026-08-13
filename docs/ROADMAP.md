# Nexus — Progress & Roadmap

## Phase 4: closing the agile-planning gap vs. Jira/Azure DevOps Boards

Every prior phase focused on breadth (every domain has *something*) and
then security hardening. Neither addressed the gap that actually matters
most for "does this feel like Jira/ADO": `services/pm` was a flat ticket
tracker — projects, tickets, a configurable workflow — with no sprints, no
rankable backlog, no story points, no burndown. That's not a rounding
error; agile planning is the core identity of both products being matched,
not a nice-to-have on top of a ticket tracker.

Shipped this pass:
- **Sprints (iterations)** — `services/pm/src/sprints/`: plan → start →
  complete lifecycle, with a DB-enforced single-active-sprint-per-project
  constraint (a unique partial index, not just application-code discipline
  — see `idx_sprints_one_active_per_project` in `002_sprints.sql`) and
  automatic carryover of unfinished tickets on sprint completion (to the
  backlog or a named next sprint, mirroring Jira's own behavior).
- **Backlog ranking** — `tickets.backlog_rank`, a float-based rank with
  midpoint-insertion reordering (`POST /tickets/:id/reorder`), the same
  scheme (documented, known float-precision limitation under heavy re-
  ordering) most lightweight Jira-likes use before graduating to a full
  LexoRank string implementation.
- **Story points + sprint burndown** — `tickets.story_points`, plus a new
  `services/bi/src/sprint-burndown/` that computes the ideal vs. actual
  remaining-points line per day of a sprint by calling `pm` live. Same
  documented `updated_at`-as-completion-proxy limitation as the existing
  Monte Carlo forecaster, tracked under the same `ticket_state_transitions`
  history-table fix in Reliability & data plumbing below.
- **Live-verified, not just compiled** — booted `auth` + `pm` + `bi`
  together and walked the full lifecycle by hand: created tickets, reordered
  the backlog, created and started a sprint (and confirmed the DB rejected
  a second concurrent active sprint), assigned story points, watched the
  burndown chart's actual line stay flat until a ticket was moved to Done
  and then drop by exactly that ticket's points on exactly that day. This
  caught and fixed a real bug before it shipped: the reorder endpoint's
  before/after rank arithmetic was inverted (dropping a ticket "before X"
  put it after X) — wrong in exactly the way that never shows up in a type
  check, only in actually calling it.

Also shipped, closing the two items originally left open at the end of
Phase 4:
- **Kanban/Scrum board** — `services/pm/src/boards/`: `board_columns` +
  `board_column_states` group 1+ workflow states into a presentation
  column (separate from the workflow state machine itself, since Jira/ADO
  let you group e.g. "Dev" + "Code Review" into one "In Progress" column),
  with a `wip_limit` per column and a computed `wipViolation` flag. Every
  project gets a default 1:1 board seeded at creation; `POST /boards`
  (owner/admin-gated) replaces the full layout. `GET /boards` doubles as
  both the Kanban view (all unfinished project tickets, no sprint) and the
  Scrum view (pass `sprintId` to scope to one sprint).
- **Epic progress rollup** — `services/pm/src/epics/`: count- and story-
  point-based completion percentage over an Epic's children
  (`tickets.parent_ticket_id`), plus a project-wide portfolio view. Caught
  a real gap while building this: `parent_ticket_id` had existed in the
  schema since 001_init.sql but no endpoint ever set it — fixed by
  accepting `parentTicketId` on ticket creation and adding a dedicated
  reparent endpoint.
- **Live-verified**: booted `auth` + `pm` together, created a board,
  triggered and confirmed a real WIP-limit violation, confirmed a `member`
  gets 403'd reconfiguring the board while `owner` succeeds, built a real
  3-story Epic with story points and confirmed the rollup read exactly
  33.3%/31.3% after completing one story.
- Roadmap/timeline (Gantt-style date visualization) explicitly NOT
  included — only the completion-rollup computation shipped; a timeline
  view is a frontend concern once `apps/web` exists to render one.

## Phase 5 progress: environments + release gates, and the first UI

**Item 1 (Environments + release gates) shipped**, exactly as scoped below:
`services/cicd/src/environments/` (named promotion environments with
per-environment `requires_approval`, DB-level position ordering, freeze
windows) + `services/cicd/src/deployments/` (promotes an already-succeeded
`pipeline_run` into an environment; auto-deploys if no approval required,
else `pending_approval` until an owner/admin approves or rejects it).
Live-verified end to end: created a no-approval Dev environment and a
gated Prod environment, confirmed Dev auto-deploys, confirmed Prod lands
`pending_approval`, confirmed a `member` gets 403'd approving while
`owner` succeeds and the deployment flips to `deployed`, created a freeze
window and confirmed it blocks a new deployment request with a clear
error. This also closes item 5 (maintenance windows / freeze periods)
early, since it's cheap once environments exist and blocked the same
"deployments" concept.

Scope discipline note, since this is exactly the kind of thing easy to
overclaim: "deployed" here means the approval gate passed and the record
is stamped — it is not itself a deployment mechanism. The actual
bytes-move-to-a-server work is the pipeline run's own `docker run` steps,
which already existed. This layer is the promotion/approval/audit trail
on top, the same real scope Azure DevOps Environments has.

**First frontend code, `apps/web`**, also shipped this pass (was ⚪, zero
files, until now) — see `docs/FEATURES.md`'s new "-1. Frontend" section for
the full breakdown: Next.js 14 App Router + Zustand + TanStack Query +
next-intl (real i18n from the first commit, not retrofitted), 5 real
screens (subdomain-aware login, projects list, Kanban/Scrum board with a
live WIP-violation highlight, backlog + sprint planning). `next build`
verified for real, not just typechecked; the dev server was booted against
live `auth`+`pm` and every cross-origin request each screen makes was
confirmed to succeed with correct CORS headers. This is 2 of 16 services
with a UI — everything else in the platform (chat, repos/PRs, pipelines
including the environments/deployments feature that just shipped, test
plans, billing, compliance, incidents, and more) still has zero frontend.

## Phase 5: the rest of the exhaustive manifest — honest scope

The user's manifest asks for production-grade ADO Pipelines (environments,
release gates, canary/blue-green, feature flags, APM auto-rollback, freeze
windows, chaos engineering), a full test-plan/release-management story, and
a plugin/connector framework to Jira, Bitbucket, GitHub, and other third-
party tools — on top of everything still open from Phase 4. This is not one
pass. Each bullet below is independently a multi-service, multi-day effort;
claiming to deliver all of them "production grade" in a single turn would
be exactly the kind of overclaiming this file exists to prevent. Sequenced
by dependency and leverage, not by request order:

1. **Environments + release gates** (`services/cicd`) — a `deployments`
   concept (which pipeline run went to which named environment — Dev/
   Staging/Prod — and when), manual approval gates between environments.
   This unlocks everything else in the CI/CD list below, so it's first.
2. **Feature flags** — new service or a `cicd` submodule: flag CRUD,
   per-tenant/per-environment targeting, an SDK/eval endpoint. Independent
   of (1) but pairs with it for "flag off in prod, on in staging."
3. **Canary/blue-green rollout strategies** — depends on (1) existing
   first (a rollout strategy is a policy over environment deploys).
4. **APM-triggered auto-rollback** — depends on (1) and needs a real
   metrics/APM signal source, which doesn't exist yet either (ClickHouse
   is provisioned in docker-compose but nothing writes deployment-health
   metrics into it today).
5. **Maintenance windows / freeze periods** — small, tenant-level config;
   cheap once (1) exists to enforce it against.
6. **Chaos engineering triggers** — lowest priority; needs (1)+(3) as a
   safe target and is the least differentiating item on the list.
7. **Test plans tied to releases** — depends on (1); today they're tied to
   sprints via `pm`, there's no release/version concept to tie to yet.
8. **Releases (Fix Versions)** in `pm`, tied into (1)/(7) so "release"
   means the same thing across Boards, Pipelines, and Test Plans — not
   three different concepts that happen to share a name.
9. **Package/artifact registry** (Azure Artifacts equivalent) — large,
   self-contained (its own storage/auth/versioning semantics), doesn't
   block anything above; can slot in independently whenever prioritized.
10. **Plugin/connector framework** — the biggest single item. Real scope:
    an install/config flow, per-connector OAuth or PAT credential storage
    (needs BYOK/KMS from Phase 2's security list to do properly, not
    plaintext), a sync engine (poll or webhook-driven) per connector, and
    then the actual Jira/Bitbucket/GitHub connectors on top of that
    framework — each of which is its own external API integration with its
    own pagination, rate limits, and field-mapping quirks. `api-platform`'s
    existing API keys + webhook delivery are necessary infrastructure for
    this but are not the framework itself.

Recommendation: pick ONE of (1) or (10) as the next real target, since
both are prerequisites for most of the list — I'd start with (1)
Environments + release gates, since it's smaller, unlocks 5 of the other 9
items directly, and extends `cicd` (which already has a real runner) rather
than starting a new integration surface from zero.
- [ ] **Velocity chart** — sum of completed story points per completed sprint, trivial once 2+ real sprints exist; not built this pass since there's nothing to chart yet.
- [ ] Releases (Fix Versions / Area+Iteration paths) — still nothing.
- [ ] Automation rules engine (trigger → condition → action, Jira Automation/ADO rules-style) — still nothing.
- [ ] Saved filters / a JQL-ish query language over tickets — still nothing, only fixed list/backlog endpoints.
- [ ] Wiki, package registry (Azure Artifacts equivalent), dashboard widgets — still nothing; lower priority than the above since they're not what makes a board *feel* like Jira/ADO.

## What Phase 1 delivered

Phase 0 was a compiling skeleton across 13 services. Phase 1 gave every
previously-scaffolded domain (comms, git-host, cicd, qa, bi, ai-platform) a
real Phase 1 implementation — not stubs, not health checks — and added a
security/audit layer across the board.

- **comms**: real chat channels, ticket micro-chats, message history, and a
  Redis-Pub/Sub-backed WebSocket gateway for delivery.
- **git-host**: pull requests, CODEOWNERS-driven auto-reviewer assignment,
  branch-protection-gated merges (via `git worktree`, not a fake merge).
- **cicd**: YAML pipelines executed by a real `docker run`-per-step runner,
  meters `ci_minutes` to `billing`.
- **qa**: test plans, Gherkin parsing, real JUnit XML ingestion, flaky-test
  quarantine, a live cross-service Requirement Traceability Matrix.
- **bi**: time tracking/timesheets with approval workflow, real Monte Carlo
  delivery forecasting (10,000 simulated runs) against live `pm` ticket data.
- **ai-platform**: pgvector-backed embeddings, semantic search, duplicate-
  ticket triage — with a pluggable real-or-honest-fallback embedding
  provider (see that service's README).
- **Platform-wide**: real audit-log writes + Kafka publish + a read
  endpoint (`services/auth`), a first RBAC enforcement point (`RolesGuard`),
  and a documentation pass adding header comments across the shared
  boilerplate tier in every service.

## What Phase 3 delivered

Phase 3 closed the two Phase 2 security items that unblock everything else
— both apply to every one of the 15 NestJS services + the Go `git-host`
service, and both compile clean (`tsc --noEmit` / `go build`) as of this
pass.

- **JWT: HS256 shared-secret → RS256 + JWKS.** `services/auth/src/keys/`
  now owns an RSA keypair (`KeyManagementService`) and publishes the public
  half at `GET /.well-known/jwks.json` (`JwksController`) — standard RFC
  7517. `AuthModule` signs access tokens with the private key
  (`JwtModule.registerAsync`, `algorithm: 'RS256'`, `keyid` set to a
  fingerprint of the public key). Every other service's `JwtStrategy` now
  verifies against that JWKS document via `jwks-rsa`'s
  `passportJwtSecret` (cached, rate-limited fetch) instead of trusting a
  shared secret — no service other than `auth` holds anything capable of
  forging a token anymore. `JWT_PRIVATE_KEY_PEM`/`JWT_PUBLIC_KEY_PEM`
  (base64-encoded PEM) configure a real keypair; unset, `auth` generates
  and loudly logs an ephemeral dev-only keypair, which is explicitly unsafe
  to run as more than one replica (see the warning text in
  `key-management.service.ts`). Key rotation (publishing two keys in the
  JWKS array during a handover window) is a documented, additive follow-up
  — the `kid`-keyed verification path already supports it.
- **RBAC extended past the single `users.invite` enforcement point.** The
  `Roles`/`RolesGuard` pair from `services/auth` is now also wired into
  `pm` (project creation), `billing` (subscribe/cancel, invoice
  generate/mark-paid, entitlement caps), and `compliance` (data-residency
  policy, backup/DR policy, SIEM export config, tenant data-export
  requests) — every route in those services that commits the tenant to a
  structural, financial, or security-configuration decision now requires
  `owner`/`admin`. Reads and routine per-item work (ticket transitions,
  viewing invoices, listing SIEM configs with no secret in the response)
  stay open to any authenticated member, matching the fail-open-on-
  unconfigured stance documented on `RolesGuard` itself.
- **Subdomain-based tenant routing** (`{tenantSlug}.<baseDomain>`), reusing
  `tenants.slug` — no new concept, no Keycloak/Casbin adopted (would
  duplicate `identity-federation` and `RolesGuard` respectively; see
  `docs/ARCHITECTURE.md`'s new "Subdomain-based tenant routing" section for
  the full reasoning). Two new pre-auth endpoints back it:
  `GET auth/tenants/resolve/:subdomain` (does this workspace exist, what's
  its display name) and `GET identity-federation/sso/:tenantSlug/available`
  (does it use SSO). Explicitly documented as a routing/UX layer, not the
  isolation boundary — that's still the JWT `tenant_id` claim + RLS.

## Track 0 (infra verification): first real pass complete

Brought up `docker-compose` for real, ran every service's migrations
against live Postgres, and booted `auth` + `pm` to exercise the RS256/JWKS
handshake, RBAC, and RLS end to end for the first time — not compiled,
actually run. It found real bugs on the first attempt, exactly as
predicted the last two times this was deferred:

- **`eos_comms` database was never provisioned.** `comms` was scaffolded in Phase 1, after `postgres-init/01-roles-and-databases.sql` was last touched — its `CREATE DATABASE`/`GRANT` lines were simply missing. Fixed in the init script and applied live.
- **`services/auth`'s migration referenced the `citext` type before creating the extension that defines it** — passed every compile-only check, fails the instant it runs against real Postgres (`type "citext" does not exist`). Fixed the ordering.
- **No user could ever become `owner`/`admin`.** `users/bootstrap` always created `role: 'member'`, and `invite` (the only other user-creation path) is itself gated to `owner`/`admin`. Every tenant would have been permanently locked out of every RBAC-gated route — including the ones this same pass added to `pm`/`billing`/`compliance`. Fixed: `bootstrap` now creates the tenant's first user as `owner`.
- Confirmed working, not just written: `postgres-init` creates a genuinely non-superuser `eos_app` (`rolsuper=f`) across all 16 databases; `pm` (a verify-only service with no prior connection to `auth`) independently fetched `auth`'s live JWKS document, verified a real RS256 token it never saw signed, extracted `tenant_id`/`role`, enforced RLS-scoped tenant isolation on a real query, and `RolesGuard` correctly allowed an `owner` and 403'd a `member` on the same route.
- Host port conflicts (this dev machine already runs Postgres 18 natively plus other docker-compose projects on the default 5432/6379/9092/8123/9004/9002/9001) surfaced a real gap in `docker-compose.yml` itself: ports were hardcoded, not overridable. Fixed — every port now reads from an env var with the original value as default (`POSTGRES_HOST_PORT`, `REDIS_HOST_PORT`, etc.), so this doesn't need a workaround on the next machine either.

Not yet done, still open:
- [ ] Boot the remaining 13 NestJS services + `git-host` together and walk a real cross-service flow (a ticket created in `pm` triggering `ai-platform` indexing, a PR merge in `git-host` triggering `cicd`, etc.) — this pass proved the auth handshake works, not the full service graph.
- [ ] Turn what was just done by hand into an automated integration test script (docker-compose up → migrate all → boot all → run the assertions just verified manually above).
- [ ] **Zero unit/integration tests exist anywhere in the repo, still.** This remains the single largest quality gap — most source files are compile-checked only.

## Remaining tracks

### Security & compliance hardening
- [ ] BYOK/KMS envelope encryption for the plaintext-at-rest secrets flagged 🟡 across migrations (OIDC client secrets, SIEM auth tokens, warehouse connection configs) — now the clear next item, since the two biggest auth gaps (shared-secret JWTs, unenforced RBAC) are closed.
- [ ] Key rotation for the RS256 keypair: publish outgoing + incoming key together in the JWKS array for the outgoing key's remaining token lifetime, then drop it. `KeyManagementService`/`JwksController` are structured for this (array-shaped JWKS response, `kid`-keyed) but only ever populate one key today.
- [ ] RBAC past role-level: ticket field-level, repo branch-level, and budget-visibility grants — `Roles`/`RolesGuard` is the reusable primitive (now proven across 4 services), the finer-grained permission model isn't built yet.
- [ ] Advanced access policies: IP allowlisting, impossible-travel anomaly detection — has a real audit-log event stream to key off (`user.login.failed`/`user.login.succeeded` in `services/auth`).
- [ ] Sub-tenant isolation.

### Reliability & data plumbing
- [ ] Background job runner (BullMQ or Kafka consumer groups) to replace the `async`-fire-and-forget pattern used throughout (`data-export`, `data-warehouse-sync`, webhook delivery, ai-platform indexing).
- [ ] Webhook delivery retry with exponential backoff (`api-platform` records failures but doesn't retry).
- [ ] `cicd`'s webhook-driven pipeline triggers — schema (`trigger_event_types`) exists, actual subscription wiring to `api-platform`'s webhook delivery doesn't.
- [ ] OpenTelemetry tracing across all 15 services.
- [ ] A `ticket_state_transitions` history table in `services/pm` — `bi`'s forecasting and `qa`'s RTM both currently proxy "completed" from `updated_at`, a documented approximation.

### Frontend
- [x] `apps/web` Next.js shell — no longer ⚪. See "Phase 6" below for what shipped and what's still missing (11 of 16 services still have zero screen).

### Platform maturity
- [ ] GraphQL federation gateway in front of the now-16 REST services.
- [ ] Kubernetes manifests / Helm charts.
- [ ] Dogfood `services/cicd` on this repo itself once `apps/web` gives it something worth building.
- [ ] Public API + webhook **marketplace** UI on top of `api-platform`'s API keys.

## Phase 6: extending `apps/web` — repos, pipelines, environments

Kept going on "keep extending `apps/web`" rather than the feature-flags
alternative, since the frontend gap was the largest one on the board.
Shipped 6 more screens against `git-host` and `cicd`: repos list + create,
pull requests list + merge, pipelines list/create + runs list + run detail
with step logs, and environments + deployments with the approve/reject
gate built in Phase 5. `apps/web` now covers 3 of 16 services (pm, cicd,
git-host) — 11 to go.

**Building this caught three real, production-breaking bugs in
already-"done" backend code** — see `docs/FEATURES.md`'s "Bugs building
this UI caught" subsection for full detail:
- `git-host` was still verifying the old shared HS256 secret — missed
  entirely during the RS256/JWKS migration, silently rejecting every real
  token issued since. Fixed with a Go JWKS client.
- `git push` unconditionally 403'd — `git http-backend` needs
  `http.receivepack=true` per-repo, which nothing had ever set. Fixed.
- `git-host` had no CORS headers at all — invisible to `curl`, would have
  silently blocked every browser request. Fixed with a CORS middleware.
- Also added `GET /api/repos` (list), which didn't exist — only create did.

None of these were caught by the RS256 migration's own live-verification
pass, by Track 0, or by any curl-based test in this repo's history —
only by actually driving `git-host` end to end (clone → commit → push →
open a PR) while building a UI against it for the first time. This is the
same lesson Track 0 and the sprint/board features already taught, applying
again one layer up the stack: a live test only catches what it actually
exercises, and a new consumer (here, a browser) can exercise paths no
prior test did.

## Phase 7: qa + comms UI, and feature flags

Did both remaining options from the last "suggested next action" instead
of picking one, per direction to stop pausing between them and keep
working the backlog.

**`apps/web` extended to qa + comms** (6 more screens: test plans, test
cases with Gherkin display, flaky-test quarantine, RTM, chat channels,
messages). `apps/web` now covers 5 of 16 services. Live-verified: created a
requirement ticket in `pm`, a test plan + case linked to it in `qa`,
confirmed the RTM screen's exact backing call reflects the link; created a
channel and posted a message in `comms`, confirmed history reflects it,
confirmed every new endpoint carries correct CORS headers for the
frontend's origin. One honest scope note logged rather than glossed over:
the chat UI polls on a 3s interval — `services/comms` has a real,
already-built Socket.IO gateway that was never wired into this frontend,
so "chat" here is functionally correct but not actually real-time.

**Feature flags shipped** (Phase 5 item 2, `services/cicd/src/feature-flags/`):
define a flag with a global default, target it per-environment (plain
on/off or a percentage rollout), evaluate at runtime with the environment
override taking precedence over the default. Percentage rollout uses
deterministic SHA-256 bucketing (`flagKey:bucketKey` → 0-99), not
`Math.random()`, so the same user consistently lands in the same cohort.
Live-verified: RBAC gates flag management but correctly leaves the
runtime eval endpoint open to any authenticated caller; a 200-synthetic-
user run against a 30% rollout landed at 29.5% (expected statistical
variance for a hash-based scheme, not a red flag); the same user called
twice got the same result both times.

## Phase 8: real-time chat wired, repo code browser, ADO-parity checklist

User supplied real Azure DevOps nav screenshots and set an explicit goal:
keep building until the app is at genuine ADO/Jira parity. Two things
happened this pass:

**Chat is now actually real-time.** Wiring `useRealtimeMessages` into the
channel screen surfaced two RS256 migration gaps that had survived
undetected because nothing had ever driven these two paths live before:
`federation.module.ts` was still signing SSO/SCIM login tokens with the
old HS256 shared secret (every federated login would've been silently
rejected downstream), and `chat.gateway.ts` was still verifying against
that same HS256 secret. Fixing the gateway's verification to use JWKS
surfaced a third, subtler bug: async JWKS verification inside
`handleConnection` doesn't block a client's next message, so a client
joining a room right after connecting (every real client) raced ahead of
its own auth completing. Fixed by moving verification into Socket.IO's
`io.use()` handshake middleware, which does block. All three found and
fixed via an actual socket round-trip test, not curl or `tsc --noEmit`.

**Repo code browsing shipped** — previously the single biggest visible
gap versus ADO/GitHub: git-host could clone/push/PR but the product
itself had no way to look at code. Added `services/git-host/internal/browse`
(read-only `git` plumbing: branches, tags, tree, blob, commit log) and
`apps/web`'s Files screen (branch selector, tree navigation, file viewer,
commit sidebar). Live-verified: pushed a real commit through the smart-
HTTP protocol, browsed root → subdirectory → file content through the
exact same endpoints and CORS path the UI uses.

**docs/FEATURES.md gained a new §10** — the user's ADO nav screenshots
transcribed into a literal, grouped parity checklist (Overview/Boards/
Repos/Pipelines/Test Plans/Artifacts/Project settings), each item marked
🟢/🟡/⚪ against what `apps/web` actually renders today, not just what a
backend endpoint supports. This replaces "what's left" as prose with a
concrete, ordered list to work down.

## Phase 9: Repos nav closed out, Queries (saved filters) shipped

Continuation of Phase 8's checklist-driven pass, same "work directly off
§10" instruction.

**Repos nav closed out** — dedicated Branches (+ Tags, same screen) and
Commits screens (`app/(app)/repos/[repo]/branches`, `.../commits`), both
against endpoints that shipped in Phase 8 but had no UI consumer yet.
Repos is now 🟢 across Files/Commits/Branches/Tags/Pull requests; only
Pushes (partial), Advanced Security, and PR Completion Stats remain open.

**Queries (saved filters) shipped** (`services/pm/src/queries`) — a
structured, whitelist-based filter builder over tickets, not a string-
parsed query language: `filter-builder.ts` checks every `{field,
operator, value}` triple against a hardcoded whitelist before it ever
touches a SQL string, and values are always bound as parameters. That
makes "safe by construction" true without a real grammar/tokenizer or an
injection review on every future field addition — a field not in the
whitelist simply can't be filtered on. Ad hoc execution (`POST
/queries/execute`) and save/list/delete/execute-by-id all shipped, plus
`apps/web`'s Queries screen (filter-row builder, save, run, results list).
Live-verified: filtered by `type` and by `title contains`, confirmed a
non-whitelisted field is rejected with a 400 rather than silently
ignored or (worse) reaching the query string, saved a query, executed it
by id, deleted it — all against real Postgres with a real migration run.

## Phase 10: Wiki + Retrospectives

Continuation of the same checklist-driven pass.

**Wiki shipped** (`services/pm/src/wiki`) — page CRUD scoped to a
project, plain text/markdown storage (no rendering — `pre-wrap` display
only, deliberately: real markdown-to-HTML rendering would mean either a
new dependency or hand-rolled parsing, and either one earns its own
XSS review before shipping; storing and editing raw text first is the
honest, safe increment). Schema includes `parent_page_id` for a future
page tree even though the UI renders a flat list today. `apps/web` gained
a list screen + a detail/edit screen (view → edit → save, delete).
Live-verified: created a page, listed it, updated title+content, fetched
it back, deleted it — real Postgres, real migration run.

**Retrospectives shipped** (`services/pm/src/retrospectives`) — a retro
optionally tied to a sprint, three-column item board (went well / went
poorly / action item) with a server-side category whitelist (same
"reject, don't silently coerce" pattern as the Queries feature's field
whitelist — confirmed live: a bogus category gets a 400, not a
miscategorized row). `apps/web` gained a list screen + a board screen
(add/remove items per column, close the retro). Live-verified full
lifecycle: create → add three items across all three categories → fetch
grouped-by-category → delete one → close → list shows it closed.

Both features: `tsc --noEmit` clean, real `next build` clean (24 routes
total now), CORS headers checked on the exact calls the UI makes.

## Phase 11: Team planner — and a real gap it exposed

**Team planner shipped** (`services/pm/src/team-planner`) — per-sprint,
per-person capacity vs allocated work, in story points rather than
ADO's hours+days-off+activity model (see team-planner.service.ts's
docblock: points is the one unit every other planning feature in this
app — burndown, forecasting, backlog — already uses, so capacity doesn't
need its own conversion). `apps/web` gained a table screen: pick a
sprint, see every tenant user's capacity vs. allocated points and ticket
count, edit capacity inline, overallocation flagged in red.

**Live-verifying it surfaced a real gap that had nothing to do with Team
Planner itself**: there was no way to assign a ticket to a user at all —
`assignee_user_id` has existed on `tickets` since 001_init.sql, same as
`parent_ticket_id` was before Epic rollup needed it (Phase 4), but no
endpoint ever set it. Team Planner's "allocated points" number is
meaningless without assignment existing, so `POST /tickets/:id/assignee`
was added as part of this pass, not deferred — this is the second time a
new agile-planning feature has been the thing that finally exercises an
old, silently-unused column and finds it was never wired up.

Live-verified end to end: two real users, one assigned 8 points against
a 6-point capacity (flagged overallocated), one assigned 3 against 5
(not flagged), then raised the first user's capacity to 10 and confirmed
the flag cleared and the underlying row was upserted, not duplicated.
`tsc --noEmit` clean, real `next build` clean (25 routes), CORS checked
on the exact calls the UI makes.

## Phase 12: targeted gap-closing — transitions history, assignee UI, wiki rendering

User asked to "targetedly address the gaps and implement them end to
end" — three items closed from Phase 11's list, each fully wired
frontend-to-database and live-verified, none left as a backend-only or
UI-only half-measure:

**`ticket_state_transitions` history table shipped** — every transition
(including a ticket's birth into its initial state) now writes a row.
`entered_current_state_at` (a correlated-subquery column, shared via one
exported constant so `tickets.list()` and `sprints.getSprintTickets()`
compute it identically) replaced `updated_at` as the completion-date
signal in both `services/bi`'s ForecastingService and
SprintBurndownService. Live-verified the exact failure mode this fixes:
completed a real ticket, then edited an unrelated field (story points) —
confirmed `updated_at` moved 8 seconds later while
`entered_current_state_at` correctly stayed put — then confirmed a real
sprint's burndown chart drops on the ticket's true completion date, not
whenever it was last touched for any reason.

**Assignee UI shipped** — the endpoint added in Phase 11 had no picker
anywhere. Now: a per-ticket assignee dropdown in the backlog (populated
from a new `useTenantUsers` hook wrapping auth's `/users`), and assignee
name display on board cards. Live-verified the board's exact API
response carries `assignee_user_id` through correctly.

**Wiki markdown rendering shipped** — Phase 10 deliberately shipped
plain-text-only, flagging that real rendering needed its own review
before landing. That review's conclusion: hand-roll a subset parser
(`lib/markdown-lite.tsx`) that builds React elements directly via
`React.createElement`, never `dangerouslySetInnerHTML` — there is no
HTML string assembled anywhere in the file, so there's no injection
surface to have gotten wrong, by construction rather than by escaping
discipline. Supports headers, bold/italic, inline code, fenced code
blocks, lists, and links — with a deliberate safety check: only
`http(s)://`, `/`, and `#` hrefs render as real anchors, anything else
(`javascript:`, `data:`, etc.) downgrades to literal text. Live-verified
by transpiling the component standalone and running
`renderToStaticMarkup` against real page content including a
deliberately malicious `javascript:` link — 8/8 checks passed, including
confirming no `javascript:` href ever reaches the output.

All three: `tsc --noEmit` clean across pm/bi/web, real `next build`
clean, and — per the standing discipline — verified by driving the
actual code path a real caller would, not by inspection.

## Phase 13: Dashboards

**Dashboards shipped** (`services/pm/src/dashboards`) — the last
Overview-hub §10 item with zero backend, now the first fully closed one.
A dashboard is a named layout of widgets; each widget holds config only
(e.g. which sprint or repo to pull from), never data — rendering calls
the same endpoint a dedicated screen for that data source already calls,
matching this platform's existing "no aggregation gateway" pattern
(docs/ARCHITECTURE.md). 5 widget types, same hardcoded-whitelist pattern
as queries' fields and retrospectives' categories: ticket counts by
state, sprint burndown, open pull requests, flaky tests, team capacity.

Sprint burndown's widget is also the **first-ever UI** for a chart that
has existed backend-only since Phase 4 — rendered as a hand-rolled inline
SVG sparkline (`components/dashboard-widget.tsx`), no charting library
dependency for one two-line chart.

Live-verified: created a dashboard, added a widget of each type,
confirmed a non-whitelisted widget type is rejected with 400, confirmed
every widget's exact data-fetch call succeeds with correct CORS headers
across pm/bi/git-host/qa.

Also folded in from the tail of Phase 12's list: assignee UI (backlog
picker + board card display) and wiki markdown rendering were already
covered there — this phase's docs update reflects both being fully
closed, not just backend-complete.

## Phase 14: canary/blue-green, project settings, PR stats, test progress — one continuous pass

User asked to do the remaining §10 backlog "in a single flow, without
stopping." Five features shipped back to back, each live-verified before
moving to the next:

**Canary/blue-green rollout strategies** (`services/cicd/src/deployments`)
— `strategy` field on a deployment: 'canary' steps through configurable
stages (e.g. [10,50,100]) via an explicit promote action per stage,
'blue_green' lands at 'verifying' (0% traffic) until an explicit cutover.
Rollback aborts either mid-flight. Verifying this required a genuinely
succeeded pipeline run for the first time in this session with a real
repo behind it — which surfaced a serious bug: the runner embedded the
JWT as HTTP Basic auth in the clone URL, but git-host strictly requires a
`Bearer` header and rejects Basic outright. **Every pipeline run that
ever reached the clone step had always failed**, invisibly, because no
prior test had wired a real repo + real git-host + a real triggered run
together in one place. Fixed with `-c http.extraHeader`. Re-verified: a
real `docker run` step executed and produced real logs, then the full
canary (10%→50%→100%→deployed) and blue-green (verifying→cutover→
deployed) lifecycles were driven against that real run, plus rollback
and the "last stage must be 100" validation.

**Project settings UI**, three real gaps closed along the way:
- *Permissions* — role management had no endpoint at all before this
  pass (`create()` set a role once; nothing ever changed it). Added
  `PATCH /users/:id/role`, owner-only, blocking self-change to prevent
  lockout. Live-verified: promote, self-change blocked, non-owner admin
  blocked.
- *Service hooks* — backend (api-platform) already existed; UI didn't.
  Confirmed the signing secret is shown once on create and never again
  on list.
- *Repositories (branch protection)* — upsert existed, list didn't.
  Added `GET .../branch-protection`, confirmed upsert updates the
  existing row rather than duplicating.
- *Activity feed* — straightforward UI over auth's already-complete
  audit_log.

**PR Completion Stats** (`app/(app)/repos/[repo]/pr-stats`) — total/open/
merged/closed, merge rate, average hours-to-merge, computed client-side
from git-host's PR list, whose `mergedAt` field had no frontend type or
consumer until now.

**Test Plans progress report** (`services/qa` + `app/(app)/projects/[id]/
test-plans/progress`) — pass/fail/untested breakdown per plan, reusing
RTM's "latest execution per case" join. Live-verified with real ingested
JUnit results (2 passed, 1 failed, 1 untested → exact counts confirmed)
and confirmed an empty plan reports all-zero rather than being silently
dropped from the list.

Every piece: `tsc --noEmit` / `go build` clean, real `next build` clean
(33 routes now, 7 of 16 services with UI), and — the discipline that's
held for seven phases — verified by driving the actual code path a real
caller would, not by inspection. This pass alone found two more real
bugs that inspection would not have: the CI clone auth mismatch (the
most significant bug found all session) and the missing role-change
endpoint.

## Phase 15: the rest of the §10 backlog, in one pass — including a brand-new service

All six items the previous "Suggested next action" listed shipped this
pass, each live-verified before moving to the next (full detail, exact
commands run, and every bug found is in `docs/CHANGELOG.md` — that file
is now the authoritative append-only trail; this section stays a shorter
narrative pointer into it):

1. **Test Plans exploratory sessions** (`services/qa/src/exploratory`) —
   charter-driven session tracking, notes optionally linked to a bug
   ticket, owner-only completion. Live-verified full lifecycle including
   403/400 edge cases.
2. **Pipelines Library** (`services/cicd/src/library`) — variable groups
   (secret entries write-only, masked on list), secure files (metadata-
   only, no download endpoint), task groups — all three resolved by the
   runner at `execute()` time, not stored as dead config. Live-verified
   against a real triggered pipeline run: a task-group step's real
   output, a secret env var, and a secure file's exact content all
   confirmed inside the real `docker run` container.
3. **Velocity chart + 6th Dashboards widget** (`services/pm`'s `GET
   /sprints/velocity`) — closes a §2 gap that had been waiting on
   "2+ real completed sprints to exist," not on any missing code. Live-
   verified a carried-over ticket correctly attributes points to the
   sprint it actually finished in, not the one it started in.
4. **Delivery Plans** (`services/pm/src/delivery-plans`) — the first
   cross-project view in the platform; a saved `{name, project_ids[]}`
   generates a merged sprint timeline across all of them. Honest scope
   note: sprint dates only, no epic-level date bars (schema has no
   target-date concept on epics).
5. **Advanced Security / secret scanning** (`services/git-host/internal/
   secretscan`) — real `git grep -E` against a repo's default branch,
   triggered asynchronously after a successful push. CVE/dependency
   scanning deliberately NOT built — faking it with a hand-picked
   "known-bad-versions" list would look like coverage while providing
   none. Found and fixed three real POSIX-ERE-vs-PCRE regex bugs in the
   scanner itself while getting it working against a real pushed commit.
6. **Artifacts/package registry** (`services/artifacts`, new service,
   port 4017 — the 17th service in the platform) — a real npm-registry-
   protocol-compatible feed. Verified against the **actual npm CLI**:
   `npm publish` → `npm view` → `npm install` in a separate consumer
   directory → `require()`d the installed module and ran it. The
   strongest verification bar used for any feature this session, because
   it was the only way to be sure the protocol implementation was
   actually compatible with a real client rather than just this
   session's own test harness.

Also fixed in passing: `README.md`'s service table had said "apps/web:
⚪ Not started" since before the frontend existed at all — corrected to
reflect the 39-screen reality, and a stale mismatch between `apps/web`'s
`apiPlatform` default port comment and the actual service was left
as-is (not touched this pass, noted here so it isn't silently forgotten).

## Suggested next action

`docs/FEATURES.md` §10 is still the ground-truth parity list, but every
item that started this backlog is now closed at 🟢 or an honestly-scoped
🟡. What's left is smaller and lower-priority:

1. **Teams** (multiple teams per project, each with its own board/
   backlog view) — real new scope, no existing endpoint to extend.
2. **Deployment groups** (legacy agent-based CI targets) — explicitly
   low priority; ADO itself is deprecating this model.
3. **GitHub connections** — deferred with the rest of §9's connector/
   plugin framework, which is itself still ⚪ in full.
4. **Scoped npm package support** (`@org/name`) and **Maven/NuGet feed
   protocols** — both documented gaps in the new artifacts service,
   not silently dropped; scoped packages need a wildcard route plus
   `%2f`-decoding, Maven/NuGet need their own protocol implementations
   entirely (this session only built npm's).
5. **CVE/dependency scanning** — the other half of "Advanced Security,"
   deliberately not faked; needs a real advisory feed (OSV, GitHub
   Advisory, or npm audit's database) wired in before it's worth
   building at all.

Beyond §10 specifically, the standing gaps flagged repeatedly across
this whole build: **zero automated tests anywhere in the repo** (every
verification in every phase, including this one, has been live-manual —
real, but not regression-proof), BYOK/customer-managed keys (several
services persist secrets as plaintext with an explicit 🟡 comment at each
column), and the formal plugin/connector framework §9 describes.

The discipline holds: live-verify against real infra before calling
anything done, exercise each service the way its real caller actually
will (up to and including, this pass, the real npm CLI rather than a
hand-rolled test client), and keep §10 updated in the same commit as the
code that changes its status. Eight phases running now (8-15) have each
shipped real, live-verified slices — several of them catching load-
bearing bugs (git-host's HS256 gap, the async-JWKS chat race, the CI
clone auth mismatch, and now three POSIX-ERE regex bugs in the secret
scanner) that only surfaced because something finally drove the real
path end to end instead of stopping at a compile or a mocked call.
