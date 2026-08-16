# Nexus — Codebase Audit (2026-08-16)

Full read-through audit of every service under `services/*`, `apps/web`, and
`packages/*`, looking for correctness bugs, crash risks, and security gaps.
Every finding below was verified by reading the exact quoted code — nothing
here is speculative. Ranked by severity within each section; **Critical**
items are exploitable now with real tenant/user impact, **High** items break
core functionality or crash processes, **Medium**/**Systemic** are
validation/consistency gaps worth cleaning up.

> **Status (2026-08-16, later same day):** All 21 Critical and all 9 High
> findings below have been fixed — see the ✅ marker on each. The Medium/Low
> findings and the cross-cutting Systemic validation-pipe issue are not yet
> addressed; see the note at the end of this doc.

---

## Critical

### 1. Arbitrary file write via npm-publish attachment filename (`artifacts`) — ✅ FIXED
`services/artifacts/src/packages/storage.ts:16-21` — `writeTarball` joins an
unsanitized `filename` (from `Object.keys(body._attachments)[0]` in a raw
`PUT /:package` body) and an unsanitized `packageName` (`:package` URL param)
straight into `path.join()`, with no `basename()`/`..`-rejection.
**Impact:** an authenticated user can publish `_attachments` keyed
`"../../../../etc/cron.d/evil"` and write arbitrary files anywhere the
process can write; the matching `readTarball` path gives arbitrary file
read too.

### 2. Arbitrary file write via call-recording filename (`comms`) — ✅ FIXED
`services/comms/src/calls/storage.ts:16` — identical bug: `POST
/calls/:id/recording` with `body.filename = "../../../../etc/cron.d/evil"`
writes outside the intended storage dir. Also causes a header-injection crash
downstream: a `filename` containing `"`/`\r`/`\n` breaks the
`content-disposition` header on download (`calls.controller.ts:24`),
throwing `TypeError: Invalid character in header content` (500).

### 3. Unauthenticated WebRTC signaling relay to arbitrary sockets (`comms`) — ✅ FIXED
`services/comms/src/chat-gateway/chat.gateway.ts:208-214` —
`handleCallSignal` forwards to any client-supplied `targetSocketId` with **no
check** that the target is in the same call room or even the same tenant.
Any authenticated socket can inject signaling payloads into any other
connected socket across tenants.

### 4. No authorization check on adding channel members (`comms`) — ✅ FIXED
`services/comms/src/channels/channels.service.ts:68-77` (`addMember`) — any
authenticated tenant user can `POST /channels/:id/members` with any
`channelId` (including private channels) and any `userId`, with zero
membership/admin check on the caller.

### 5. Hardcoded fallback secret on a mass-deletion internal endpoint (`comms`) — ✅ FIXED
`services/comms/src/messages/retention-internal.controller.ts:13` —
`process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret'`. If the
env var is ever unset in production, the literal fallback string (shipped in
source) authorizes anyone to purge a tenant's entire chat history via
`POST /internal/retention/purge-messages`.

### 6. Silent fallback to a hardcoded, publicly-known encryption key (`packages/kms`) — ✅ FIXED
`packages/kms/src/envelope.ts:19-33` — if `EOS_KMS_MASTER_KEY` is unset,
`resolveMasterKey` falls back to `DEV_ONLY_MASTER_KEY_HEX = '0'.repeat(63) +
'1'` with only a `console.warn`, not a thrown error. This package encrypts
OIDC/SAML client secrets and SIEM tokens at rest for `identity-federation`
and `compliance`. A missing env var in any deployment (routine ops mistake)
silently encrypts real secrets with a key published in this very file —
anyone with source access can decrypt them. **Should fail closed (throw)
outside dev/test.**

### 7. Rate limiter: negative token request bypasses the capacity cap (`packages/rate-limiter`) — ✅ FIXED
`packages/rate-limiter/src/token-bucket.ts:33-37` — `requested` is never
validated `>= 0`. Calling `consume(key, config, -1000000)` always "succeeds"
and adds a million tokens to the bucket, uncapped by `capacity` (the cap is
only enforced on refill, not on consume). Disables rate limiting for that
tenant across every service using this shared package.

### 8. Rate limiter: zero refill rate crashes every request on the guarded route (`packages/rate-limiter`) — ✅ FIXED
`packages/rate-limiter/src/token-bucket.ts:40` —
`math.ceil(capacity/refillPerSecond)+60` in the Lua script divides by zero if
`refillPerSecond` is `0` (unvalidated), producing a non-finite `EXPIRE` TTL
that Redis rejects. `TenantRateLimitGuard.canActivate` doesn't catch this, so
every request through that guard throws an unhandled 500.

### 9. SAML replay-protection ID collapses to a constant → total SSO lockout (`identity-federation`) — ✅ FIXED
`services/identity-federation/src/sso/saml-sp.service.ts:100` —
`extract.response?.id ?? extract.audience`. If the IdP's response shape omits
`response.id`, the fallback (`audience`, the SP's own entity ID) is
**identical for every assertion from every user**. The first SSO login for a
tenant marks that constant value "used"; every subsequent SSO login for
*any* user in that tenant is then rejected as a replay — a full SSO outage
triggered by the very first login.

### 10. Cross-tenant SSO connection hijack via unchecked `tenantSlug` (`identity-federation`) — ✅ FIXED
`services/identity-federation/src/sso/sso-connections.controller.ts:24-31,
45-51` — `tenantId` is correctly derived from the JWT, but `tenantSlug` is
taken verbatim from the request body with no ownership check. Since the
unauthenticated login/ACS/metadata endpoints look up connections by
`tenant_slug` alone, a malicious tenant admin can register an OIDC/SAML
config under `tenantSlug: "victim-tenant"`, redirecting victim's SSO login to
an attacker-controlled IdP.

### 11. Cross-tenant SCIM provisioning via unchecked `tenantSlug` (`identity-federation`) — ✅ FIXED
`services/identity-federation/src/scim/scim-tokens.controller.ts:17-23` —
same pattern: a SCIM token's `tenant_slug` is client-supplied and unchecked.
The resulting token can drive `provisionInAuthService` to create/overwrite
users in a different tenant than the one the token is scoped to.

### 12. Cross-tenant public status-page injection (`incident-management`) — ✅ FIXED
`services/incident-management/src/status-page/status-page.service.ts:6-17`
— `upsertComponent`'s `tenantSlug` comes from the caller's body, unchecked
against their real tenant. Any authenticated user of Tenant A can inject a
fake status component (e.g. "major outage") onto Tenant B's real public
status page.

### 13. Any CI runner can forge results for a job it never ran (`cicd`) — ✅ FIXED
`services/cicd/src/runners/runners.service.ts:128-144` — `completeJob`
updates by `id` + `status='claimed'` only; it never checks
`claimed_by_runner_id` against the calling runner (the controller doesn't
even pass the caller's runner id in). Any registered runner can `POST
/runners/jobs/:id/complete` with fabricated logs/exit code for a job claimed
by a different runner.

### 14. Runners can claim jobs outside their labels and steal another user's bearer token (`cicd`) — ✅ FIXED
`services/cicd/src/runners/runners.service.ts:104-126` — `claimNextJob`'s
`labels` filter comes from the caller's query string, never cross-checked
against the runner's own registered labels. Since `claimNextJob` also
returns the triggering user's stashed bearer token, this lets any runner
harvest tokens for jobs it wasn't assigned.

### 15. Cross-repo PR merge / branch-protection bypass (`git-host`, Go) — ✅ FIXED
`internal/pullrequests/pullrequests.go:169-216` — `Merge()` looks up the PR
by `id` only (not scoped to the `repoName` in the URL), then uses the
**caller-supplied `repoName`** — not the PR's actual `pr.RepoName` — for
every branch-protection check and the merge itself. A PR belonging to
`repoB` can be merged through `POST
/api/repos/repoA/pulls/{prIdFromRepoB}/merge`, applying `repoA`'s (possibly
unconfigured) protection rules and, on branch-name collisions, merging the
wrong repo's content.

### 16. Branch protection silently disabled on malformed glob patterns (`git-host`, Go) — ✅ FIXED
`internal/branchprotection/branchprotection.go:105` and
`internal/branchprotection/allowlist.go:117` — both discard the `error`
return from `filepath.Match`. A malformed pattern (e.g. unbalanced `[`)
makes matching always return `false` with the error silently dropped —
which the allowlist code's existing fail-open design then interprets as "no
rule applies," disabling the protection/allowlist an admin explicitly
configured, with no error surfaced anywhere.

### 17. SSRF + secret exfiltration via unvalidated SIEM export URL (`compliance`) — ✅ FIXED
`services/compliance/src/siem-export/siem-export.controller.ts:20-25` +
`siem-export.service.ts:131-148` — `endpointUrl` is accepted from the
request body with zero validation (no scheme/host allowlist) and later
`fetch()`'d with the tenant's decrypted SIEM auth token attached. A
tenant admin can point it at an internal-only address (e.g. cloud metadata
endpoint) to exfiltrate the token and trigger internal requests — and it
re-fires unattended on every scheduler tick once configured.

### 18. Project-guest cross-project data leak on the board view (`pm`) — ✅ FIXED
`services/pm/src/boards/boards.service.ts:47-54` — `ProjectGuestGuard`
validates guest membership using `projectId` only; `getBoard`'s
sprint-ticket query filters solely by `sprintId`, never joining back to that
validated `projectId`. A guest with legitimate access to Project A can pass
a `sprintId` belonging to Project B and receive that project's full ticket
data — defeating the guest-isolation guarantee the guard exists to enforce.

### 19. Employees can self-approve their own timesheets; unguarded access to salary-adjacent invoice data (`bi`) — ✅ FIXED
`services/bi/src/time-tracking/time-tracking.controller.ts:33-51` —
`approveTimesheet`/`rejectTimesheet`/`generateInvoice` are gated only by
`JwtAuthGuard`, with no `PermissionsGuard`/ownership check (unlike
`budgets.controller.ts`, which explicitly locks equivalent rate-card data
behind `budget.edit`). Any tenant member can approve their own submitted
timesheet, and any tenant member can trigger contractor-invoice generation,
which reads real hourly rates.

### 20. IPv6 traffic silently bypasses the tenant IP allowlist (`auth`) — ✅ FIXED
`services/auth/src/tenants/ip-match.util.ts:50-55` — `if
(normalized.includes(':')) return true;` treats *any* IPv6 address as
automatically allowed, regardless of configured CIDR ranges. A feature sold
as an access-control boundary provides zero protection against any IPv6
client.

### 21. Federation-issued JWTs missing claims other services assume exist (`auth`) — ✅ FIXED
`services/auth/src/federation/federation-internal.controller.ts:72-75` —
SSO/SCIM-issued tokens omit `sid`, `is_guest`, and `permissions` (present on
every token from the normal login path, `auth.service.ts:298-312`). A
custom-role SSO user hits `undefined.includes(...)` or is silently denied
wherever downstream code checks `payload.permissions`.

---

## High

### 22. Duplicate invoice generation — no idempotency guard (`billing`) — ✅ FIXED
`services/billing/src/invoicing/invoicing.service.ts:32-70` — no check for
an existing invoice covering the same `(tenant_id, period_start,
period_end)`, and no DB unique constraint either (unlike
`contractor_invoices`, which has one and explicitly documents the pattern).
A double-click or retried request double-bills a tenant for the same period.

### 23. Invoice/contractor-invoice status transitions are unconditional (`billing`) — ✅ FIXED
`invoicing.service.ts:82-90` (`markPaid`) and
`contractor-invoices.service.ts:49-58` (`setStatus`) — no `WHERE status IN
(...)` guard. A `'void'` invoice can be pushed back to `'paid'`, or a `'paid'`
one reverted to `'issued'`, silently corrupting the AR ledger.

### 24. Unvalidated numeric billing input propagates `NaN` into permanent, silent failures (`billing`) — ✅ FIXED
`metering.controller.ts:16,41` and friends — request bodies/query params are
typed as plain TS interfaces, so NestJS's `ValidationPipe` never runs
(class-validator needs a real DTO class). A non-numeric `quantity`/`limit`
becomes `NaN`, gets stored, and every subsequent `sum(quantity)` for that
tenant/metric returns `NaN` — permanently breaking entitlement checks
(`currentUsage + additional <= limit` is always `false`) and silently
dropping overage billing (`total > 0` is always `false`) for that
tenant/metric going forward.

### 25. Digest notifications are silently and permanently dropped (`notifications`) — ✅ FIXED
`services/notifications/src/digest/digest.service.ts:55-86` — two separate
bugs: (a) the batch query caps at `limit 50` but the "last sent" cursor is
set to `now()` regardless, so anything beyond the newest 50 falls below the
new cursor and is never picked up again; (b) the read (SELECT) and cursor
update (`last_sent_at = now()`) aren't in the same transaction, so any
notification created in that window is skipped by every future digest.

### 26. Unhandled `pg.Pool` `'error'` event — DB blip crashes the entire service (`onboarding`) — ✅ FIXED
`services/onboarding/src/db/pool.ts:11` — no `pool.on('error', ...)`
listener anywhere. node-postgres emits `error` when an idle pooled
connection drops (DB restart, network blip, failover); with zero listeners
this becomes an uncaught exception that kills the whole process — not just
one request.

### 27. HR webhook processing has no idempotency — duplicate onboarding/offboarding workflows (`onboarding`) — ✅ FIXED
`services/onboarding/src/hr-sync/hr-sync.controller.ts:39-46` — no unique
constraint on `hr_sync_events` and no existing-workflow check before
`startOnboarding`/`startOffboarding`. At-least-once webhook delivery (the
norm for Workday/BambooHR) duplicates onboarding task sets and re-fires
deprovisioning calls on retried "terminated" events.

### 28. Naive keyword substring matching causes false incident status transitions (`incident-management`) — ✅ FIXED
`services/incident-management/src/incidents/incidents.service.ts:76-86` —
plain `.includes(keyword)` against free-text update messages. A message like
*"still not resolved, continuing to investigate"* contains "resolved" as a
substring and incorrectly flips the incident to resolved status with a
stamped `resolved_at`, the opposite of the update's intent.

### 29. Unvalidated `destinationType` silently mis-routed to the wrong export writer (`data-warehouse-sync`) — ✅ FIXED
`services/data-warehouse-sync/src/exports/export-destination.ts:18-20` +
`exports.service.ts:98-114` — any string not literally `'snowflake'` or
`'bigquery'` falls through to the local-disk writer meant only for
`'s3_parquet'`. A typo'd `destinationType` silently "completes" with data
written to the wrong place and no error surfaced.

### 30. Dashboard widget crashes on an empty data series (`apps/web`) — ✅ FIXED
`apps/web/components/dashboard-widget.tsx:59,68` — `data.series` is
null-checked but never checked for emptiness before `data.series[length-1]`.
A sprint burndown widget with no datapoints yet throws `Cannot read
properties of undefined (reading 'actualRemaining')` and crashes the
dashboard render.

---

## Systemic issue (cuts across nearly every service)

**NestJS's global `ValidationPipe` is a no-op almost everywhere**, because
request bodies/queries are typed as plain TypeScript interfaces (`body:
{ foo: string }`) instead of `class`-based DTOs decorated with
`class-validator`. TypeScript's structural types are erased at compile time,
so `whitelist`/`transform` have nothing to validate against — malformed,
missing, or wrong-typed fields sail through to raw SQL binds and surface as
uncaught Postgres errors (generic 500s) instead of clean 400s. Confirmed
independently in `ai-platform`, `auth`, `billing`, `bi`, `cicd`, `comms`,
`compliance`, `data-warehouse-sync`, `incident-management`,
`notifications`, `onboarding`, `pm`, and `qa`. This is worth a single
cross-cutting fix (introduce real DTO classes) rather than 13 separate
patches.

Related recurring pattern: `Number(queryParam)` used directly for
pagination/limits with no `isNaN` guard (seen in `ai-platform`, `auth`,
`bi`, `billing`, `cicd`, `comms`) — a non-numeric `?limit=` produces `NaN`
bound as a SQL parameter, surfacing as a 500.

Related recurring pattern: several single-record `GET`/action endpoints
return `200` with a degenerate/`null` body instead of `404` for a missing or
cross-tenant id, inconsistent with sibling endpoints in the same service
(`incident-management` incidents get/resolve, `cicd` runs get, `onboarding`
completeTask, `pm` epics rollup).

---

## Medium

- **`qa` — prototype-key pollution via `in` operator**: `axe-parser.ts:37`
  uses `v.impact in countsByImpact`, which matches inherited
  `Object.prototype` keys (`constructor`, `toString`, etc.). An axe-core
  report with `"impact": "constructor"` corrupts the returned counts object.
- **`qa` — mid-batch JUnit ingest failure loses subsequent test cases**:
  `junit-parser.ts:30` turns a non-numeric `time` attribute into `NaN`,
  which Postgres rejects on insert (`duration_ms` is `int`); because each
  testcase commits its own transaction, everything after the bad one in the
  same report is silently never ingested.
- **`graphql-gateway` — unescaped arguments spliced into downstream REST
  URLs** (`gateway.resolver.ts:44,50,82`): no `encodeURIComponent`. A
  crafted `projectId`/`id` argument can inject extra query parameters or,
  via `..` path segments, redirect the outbound request to a different path
  on the downstream service while still carrying the caller's forwarded
  token.
- **`cicd` — race condition on environment `position` assignment**
  (`environments.service.ts:6-19`): unlocked `SELECT max(position)+1` then
  `INSERT` lets two concurrent requests create environments with the same
  position, corrupting promotion ordering.
- **`cicd` — approval decision has no state transition**
  (`runner.service.ts:298-305`): `decideApproval` sets
  `approved_by_user_id`/`approved_at` but never flips `status` off
  `'waiting_approval'`, so concurrent approve+reject calls can both "succeed."
- **`cicd` — timing side-channel in runner auth** (`runners.service.ts:83-89`):
  unknown-runner lookups short-circuit before the constant-time secret
  comparison; known-runner-wrong-secret always pays the full scrypt cost —
  distinguishable timing lets an attacker enumerate valid runner IDs.
- **`git-host` — CODEOWNERS prefix-matching is over-broad**
  (`codeowners.go:49`): `strings.HasPrefix` with no path-segment boundary
  means a rule for `docs` also matches `docs-legacy/...` or `docs_internal.go`.
- **`git-host` — `RequireCodeownerReview` flag read but never enforced**
  (`pullrequests.go:206-213`, `_ = rule.RequireCodeownerReview`).
- **`packages/deploy-orchestrator` — unvalidated CLI args**: `currentColor`
  is cast without checking it's `'blue'`/`'green'` (`cli.ts:16`, a typo like
  `Blue` silently misdirects the port plan); `basePort` isn't `isNaN`-checked
  (`cli.ts:21`, produces a doomed 60s timeout instead of a clear error);
  `startCommand.split(' ')` (`deploy.ts:79`) breaks on quoted arguments or
  double spaces.
- **`billing` — `SET LOCAL` tenant id via string interpolation**
  (`db/pool.ts:33`): currently safe (gated by a strict UUID regex) but a
  single point of failure if that guard is ever loosened — every other
  service in the repo uses the same pattern with the same guard, so this is
  a repo-wide fragility worth hardening once (e.g. a shared validated
  tenant-context helper).
- **`apps/web` — WebRTC error-handling gaps**: `startScreenShare`
  (`use-webrtc-call.ts:173-182`) has no `.catch`, unlike the analogous
  camera/mic path in the same file, so a denied/cancelled screen-share
  fails silently; `handleStopRecordingAndUpload`
  (`call-panel.tsx:35-37`) is `async` but neither awaited nor
  try/caught; its `FileReader` has no `onerror`, so a failed blob read
  leaves the UI stuck on "uploading…" forever.
- **`apps/web` — peers from `call:existing-peers` show as "unknown"**
  (`use-webrtc-call.ts:106-117`): only newly-joining peers get their user id
  recorded; a peer already on the call when you join is mislabeled for the
  whole call.

## Low / cleanup

- `billing` health endpoint leaks raw `err.message` (potentially internal
  infra detail) in an unauthenticated 503 response
  (`health/health.controller.ts:39`).
- `bi` — `main.ts:25` `bootstrap()` has no `.catch()`; a startup failure
  becomes an unhandled rejection instead of a clean logged exit (contrast
  with `db/migrate.ts`, which does this correctly).
- `bi` — `Math.min(...tickets.map(...))` can hit V8's max-arguments limit on
  very large projects, throwing `RangeError` (`flow-metrics.service.ts:118`).
- `incident-management` — `resolved_at` isn't cleared when a Problem is
  reopened, leaving a stale resolved timestamp on an "investigating" record.
- `qa` — `LoadTestingModule`/`AccessibilityModule` guard routes with
  `JwtAuthGuard` but don't import `AuthModule` themselves; currently works
  only because sibling modules pull it in transitively — a latent trap if
  either module is ever extracted or reordered.
- `pm` — several delete/remove methods succeed silently on a nonexistent
  target instead of throwing `NotFoundException`, inconsistent with sibling
  methods in the same files.

---

## What was reviewed and found solid

- JWT verification is correctly pinned to `RS256` everywhere (no
  algorithm-confusion risk) across `auth`, `ai-platform`, `api-platform`,
  `compliance`, `data-warehouse-sync`.
- Password/code comparisons consistently use `bcrypt.compare`/
  `authenticator.check`/`timingSafeEqual` — no raw `===` secret comparisons
  found anywhere.
- Multi-tenancy via Postgres RLS (`FORCE ROW LEVEL SECURITY` +
  `SET LOCAL app.tenant_id`) is implemented consistently and correctly
  across every service; the one string-interpolated SQL statement per
  service (`SET LOCAL`) is uniformly guarded by a strict UUID regex.
  Pre-auth `SECURITY DEFINER` functions (SCIM/API-key/status-page lookups)
  are used correctly rather than bypassing RLS unsafely.
- `git-host`'s token/secret handling, `qa`'s Gherkin/JUnit/k6/axe parsers'
  core logic (aside from the two Medium findings above), and `packages/kms`'s
  actual AES-256-GCM encrypt/decrypt path (fresh IV per call, verified auth
  tag) are all sound.
- `pm` is unusually disciplined: consistent `withTenant` RLS scoping,
  careful `??`-vs-falsy handling, whitelisted enums throughout — only one
  confirmed cross-project leak (#18) in an otherwise clean service.

---

## Suggested priority order

1. Fix the file-write path traversal bugs (#1, #2) and the WebRTC signal
   relay (#3) — trivial to exploit, high blast radius.
2. Fix the KMS dev-key fallback (#6) to fail closed, and audit whether any
   deployed environment is currently missing `EOS_KMS_MASTER_KEY`.
3. Fix the four cross-tenant hijack bugs (#10, #11, #12, #18) — all share
   the same root cause (a client-supplied slug/id used for authorization
   instead of the server-verified tenant) and can likely be fixed with one
   pattern applied in each location.
4. Fix the SAML replay lockout (#9) before it causes an SSO outage in
   production.
5. Add the `pg.Pool` error listener in `onboarding` (#26) — one-line fix,
   prevents full-process crashes.
6. Address the systemic `ValidationPipe`/DTO gap — highest leverage fix in
   the report, since it's the root cause of a dozen-plus individual crash
   findings across nearly every service.
