# Nexus — Implementation Trail

Append-only log of what actually landed, in the order it landed. This is
**not** a status snapshot (that's `docs/FEATURES.md`, which gets its
markers updated in place) and **not** a narrative/planning doc (that's
`docs/ROADMAP.md`, whose phase write-ups and "Suggested next action" get
rewritten each pass). This file is a flat trail: one entry per feature or
fix that shipped, added at the bottom, never edited or reordered after
the fact. If something turns out wrong, the correction is a new entry,
not a rewrite of the old one.

Each entry names what shipped, the real bugs it caught (if any), and how
it was live-verified — never just `tsc --noEmit`/`go build` alone, per
this project's standing discipline of driving the actual code path a
real caller would use before calling anything done.

---

## Phase 1 — initial platform build-out

Sixteen backend services stood up from scratch: `auth` (tenants, users,
JWT login, audit log, federation hooks), `pm` (projects, tickets,
configurable workflow state machine, dependency links, rate-limited
ticket creation), `git-host` (real smart-HTTP Git server — clone/push/pull
— tenant-scoped repo storage), `comms` (chat channels, ticket
micro-chats, WebSocket realtime via Redis Pub/Sub), `git-host` PR layer
(pull requests, CODEOWNERS auto-review, branch-protection-gated merge via
`git worktree`), `cicd` (YAML pipelines, real `docker run`-per-step
runner, meters `ci_minutes` to billing), `qa` (test plans, Gherkin
parsing, real JUnit XML ingestion, flaky-test quarantine, live RTM),
`bi` (time tracking/timesheets, real Monte Carlo delivery forecasting),
`ai-platform` (pgvector embeddings, semantic search, duplicate-ticket
triage), plus `identity-federation`, `onboarding`, `compliance`,
`billing`, `api-platform`, `notifications`, `incident-management`,
`data-warehouse-sync`. `packages/rate-limiter` (Redis token-bucket)
shipped as a shared package, wired into `pm` as the reference
integration.

## Track 0 — live infra verification

Brought up the real docker-compose stack (Postgres/Redis/Kafka/etc.),
confirmed all 16 databases + roles, ran all 16 services' migrations
against real Postgres, exercised the auth↔pm RS256/JWKS handshake +
RBAC end to end. Caught and fixed 4 real bugs invisible to any
compile-only check: a missing database, migration ordering, an
unreachable owner role, and hardcoded ports.

## Phase 3

Continued backend build-out and live-verification pass across the
service set stood up in Phase 1.

## Phase 4 — closing the agile-planning gap vs. Jira/Azure DevOps Boards

Ticket CRUD with custom fields and Epic-hierarchy parent linking,
configurable workflow state machine, sprints/iterations (plan/start/
complete, DB-enforced single-active-sprint, carryover), rankable backlog
+ story points (caught and fixed an inverted rank-arithmetic bug), sprint
burndown (`services/bi` — ideal vs. actual remaining points), Kanban/
Scrum board column grouping + WIP limits with default board auto-seeding,
Epic progress rollup (count- and story-point-based).

## Phase 5 — environments + release gates, and the rest of the exhaustive manifest

Environment/release management (`services/cicd` — named promotion
environments with per-environment approval gating, freeze windows).
Live-verified both the auto-deploy and gated (pending_approval → owner
approves → deployed) paths, a member correctly 403'd approving, and an
active freeze window correctly blocking a request. Also landed: feature
flags + A/B cohort assignment (deterministic percentage-based rollout via
SHA-256 bucketing — live-verified a 200-user distribution landing at
29.5% against a 30% target).

## Phase 6 — extending `apps/web`: repos, pipelines, environments

`apps/web` (Next.js 14 App Router, Zustand + TanStack Query, next-intl
from the first commit, Tailwind) went from not existing to a real app:
subdomain-aware login, projects list/create, Kanban/Scrum board, backlog
+ sprint planning, repos list/create, pull requests list + merge,
pipelines list/create + runs + step logs, environments + deployments
including the approve/reject gate.

## Phase 7 — qa + comms UI, and feature flags

Test plans + test cases with Gherkin display, flaky-test quarantine list
+ un-quarantine, Requirement Traceability Matrix screen, chat channels +
messages UI.

## Phase 8 — real-time chat wired, repo code browser, ADO-parity checklist established

Chat wired to `services/comms`'s real Socket.IO gateway (`useRealtime
Messages`) — no more polling. Repo file browser (`services/git-host/
internal/browse` — new read-only git-plumbing endpoints for branches,
tags, tree, blob, commit log; `apps/web`'s Files screen consumes all
five). Building this required driving git-host end to end for the first
time and found three real bugs: git-host was still verifying the old
shared HS256 secret (missed by the platform RS256/JWKS migration, which
only covered the 14 NestJS services); `git push` unconditionally 403'd
(`http.receivepack=true` was never set per-repo); no CORS headers at all
(invisible to curl, would silently block every real browser request).
Also added `GET /api/repos` (list), which hadn't existed.

The user supplied real Azure DevOps screenshots as the literal "minimum
checklist" target for ADO/Jira-equivalent state — this became
`docs/FEATURES.md` §10, the standing parity checklist everything since
has been measured against.

## Phase 9 — Repos nav closed out, Queries (saved filters) shipped

Dedicated Branches/Tags and Commits screens. Queries / JQL-like saved
filters (`services/pm/src/queries` — whitelist-based filter builder:
every field/operator pair checked against a whitelist before touching
SQL, values always parameter-bound, never a string parser). Live-verified
a non-whitelisted field (e.g. `password_hash`) is rejected with 400.

## Phase 10 — Wiki + Retrospectives

Wiki (markdown CRUD, plain-text-only rendering at this point — real
rendering deliberately deferred pending its own safety review).
Retrospectives (three-column went-well/went-poorly/action-item board).
Both live-verified full lifecycle, including a rejected invalid
retrospective category.

## Phase 11 — Team planner, and a real gap it exposed

Team capacity planning (`services/pm/src/team-planner` — per-sprint,
per-person capacity vs. allocated story points, overallocation
flagging). Building it exposed that `assignee_user_id` had existed on
tickets since `001_init.sql` but no endpoint had ever set it — added
`POST /tickets/:id/assignee`. Live-verified against two real users with
different allocation levels, and that re-setting capacity upserts rather
than duplicates.

## Phase 12 — targeted gap-closing: transitions history, assignee UI, wiki rendering

**`ticket_state_transitions` history table** — every `create()` and
`transition()` call now writes a row; `entered_current_state_at` (a
correlated-subquery column, shared via one exported constant) replaced
`updated_at` as the completion-date signal in both `services/bi`'s
ForecastingService and SprintBurndownService. Live-verified the exact
failure mode this fixes: completed a ticket, edited an unrelated field,
confirmed `updated_at` moved but `entered_current_state_at` correctly
stayed put, then confirmed a real burndown chart drops on the ticket's
true completion date.

**Assignee UI** — per-ticket assignee dropdown in the backlog (via a new
`useTenantUsers` hook), assignee name display on board cards.

**Wiki markdown rendering** — hand-rolled subset parser
(`lib/markdown-lite.tsx`) building React elements directly via
`React.createElement`, never `dangerouslySetInnerHTML`. Href-scheme
whitelist so `javascript:`/`data:` links downgrade to literal text.
Live-verified via `renderToStaticMarkup` against real content including a
deliberately malicious link — 8/8 checks passed.

Also fixed two RS256-migration gaps found while exercising the SSO login
and chat paths for the first time: SSO/SCIM-issued tokens were still
HS256 (`services/auth/src/federation/federation.module.ts` had its own
standalone `JwtModule.register`), and `services/comms`'s chat gateway was
also still HS256. A third bug: async JWKS verification inside
`handleConnection` didn't block a client's first message, racing a false
"not a member" error — fixed by moving verification into `afterInit`'s
`server.use(...)` Socket.IO handshake middleware.

## Phase 13 — Dashboards

Dashboard builder (`services/pm/src/dashboards` — widget-based, config-
only widgets; rendering calls the same endpoint a dedicated screen for
that data source already calls, no new aggregation gateway). 5 widget
types: ticket counts by state, sprint burndown (first-ever UI for a
chart that had existed backend-only since Phase 4, rendered as a
hand-rolled inline SVG sparkline), open pull requests, flaky tests, team
capacity. Live-verified a non-whitelisted widget type rejected with 400.

## Phase 14 — canary/blue-green, project settings, PR stats, test progress

**Canary/blue-green rollout strategies** (`services/cicd/src/
deployments` — `strategy` field: canary steps through configurable
stages via explicit per-stage promotion, blue_green lands at 'verifying'
until an explicit cutover; rollback aborts either mid-flight). Verifying
this required a genuinely succeeded pipeline run for the first time and
surfaced the most significant bug found all session: the CI runner
embedded the caller's JWT as HTTP Basic auth via URL userinfo, but
git-host strictly requires a `Bearer` header and rejected Basic outright
— **every pipeline run that ever reached the clone step had always
failed**, invisibly, since nothing had ever wired a real repo + real
git-host + a real triggered run together in one live test. Fixed via
`-c http.extraHeader`. Re-verified with a real `docker run` step
executing and producing real logs, then the full canary
(10%→50%→100%→deployed) and blue-green (verifying→cutover→deployed)
lifecycles, plus rollback and the "last stage must be 100" validation.

**Project settings UI**: Permissions (added `PATCH /users/:id/role` —
there was previously no way to change a user's role after invite at all;
owner-only, blocks self-change to prevent lockout), Service hooks (UI
over api-platform's existing webhook endpoints), Repositories/branch
protection (added the missing `GET .../branch-protection` list
endpoint), Activity Feed (UI over auth's existing audit_log).

**PR Completion Stats** (`app/(app)/repos/[repo]/pr-stats` — total/open/
merged/closed, merge rate, average hours-to-merge; found `mergedAt` had
no frontend type or consumer despite git-host already returning it).

**Test Plans progress report** (`services/qa` — pass/fail/untested
breakdown per plan, reusing RTM's "latest execution per case" join).
Live-verified with real ingested JUnit results and confirmed an empty
plan reports all-zero rather than being silently dropped.

---

## 2026-08-12 — Test Plans exploratory sessions

`services/qa/src/exploratory` — charter-driven, session-based testing
distinct from test-plans' scripted Gherkin cases: `POST
/exploratory-sessions` opens a session against a free-text charter,
`POST .../notes` logs free-form observations as the tester goes
(optionally linked to a bug ticket id), `POST .../complete` closes it out
with an outcome (`passed` | `issues_found`), restricted to the session's
own tester. New `ticket_state_transitions`-style discipline applied here
too: notes are rejected with 400 once a session is completed, a session
can't be completed twice, and completing someone else's session 403s.

Live-verified end to end against real auth + qa services: started a
session, added two notes (one with a linked bug ticket id), listed them,
rejected an invalid outcome (400), completed with a valid one, confirmed
notes are rejected post-completion (400) and double-completion is
rejected (400), then confirmed a second real user is 403'd attempting to
complete the first user's session. `tsc --noEmit` clean across
`services/qa`. `apps/web` UI shipped alongside: a session list + start
form (`app/(app)/projects/[id]/test-plans/exploratory`) and a session
detail page with note logging and complete actions gated to the session
owner (`.../exploratory/[sessionId]`), both fully i18n'd via
`messages/en.json`'s new `exploratorySessions` namespace. `apps/web`
`tsc --noEmit` clean.

This closes the last ⚪ item under Test Plans in `docs/FEATURES.md` §10.

## 2026-08-12 — Pipelines Library (variable groups, secure files, task groups)

`services/cicd/src/library` — three reusable config surfaces referenced
by name from a pipeline's YAML, resolved by the runner at `execute()`
time rather than stored as dead config nobody reads:

- **Variable groups** — named key/value sets; entries can be flagged
  secret, in which case the value is write-only (same discipline as
  api-platform's webhook signing secrets: shown once on set, masked as
  `••••••••` everywhere else, including the list endpoint). A pipeline
  declares `variableGroups: [name, ...]`; the runner resolves the actual
  (unmasked) values internally and injects each as a `docker run -e
  KEY=VALUE` flag.
- **Secure files** — named blobs, content write-only (metadata-only over
  the API, no download endpoint at all by design). A pipeline declares
  `secureFiles: [name, ...]`; the runner materializes each into the run's
  workspace before any step executes.
- **Task groups** — a named, reusable step sequence. A pipeline step
  references one via `taskGroup: <name>` instead of inlining `run`; the
  runner expands it into real steps before execution, or fails the run
  cleanly if the referenced group doesn't exist.

`services/cicd/src/runs/runner.service.ts` now takes `LibraryService` as
a constructor dependency and does all three resolutions before the step
loop runs.

Live-verified end to end against real infra — real git-host repo created
and pushed to, real `cicd` pipeline created referencing a variable group,
a secure file, and a task group all by name, real triggered run:
confirmed the task-group step's actual output appeared in its step log,
confirmed both a plain and a secret variable-group entry landed correctly
as env vars inside the real `docker run` container, confirmed the secure
file's exact uploaded content was readable from the workspace inside the
container, confirmed the variable-groups list endpoint returns the
secret value masked, confirmed secure-files list returns metadata only,
and confirmed a run referencing a nonexistent task group fails cleanly
(`status: failed`) rather than silently skipping the step. `tsc --noEmit`
clean across `services/cicd`.

`apps/web` UI shipped alongside: `app/(app)/settings/pipelines-library`
— create/list variable groups and set entries (secret checkbox), upload/
list secure files (content submitted as base64, never re-displayed),
create/list task groups — added to the shared settings sub-nav. Real
`next build` clean (35 routes now), and both new pages confirmed to
server-render their translated content correctly.

This closes the last two ⚪ items under Pipelines in `docs/FEATURES.md`
§10 (Deployment groups remains ⚪, explicitly low-priority — ADO itself
is deprecating that legacy agent-based model).

## 2026-08-12 — Velocity chart + a sixth Dashboards widget type

`services/pm`'s `SprintsService.getVelocityTrend` / `GET /sprints/
velocity` — story points completed per completed sprint, oldest first.
Closes §2's "Velocity chart" gap, previously ⚪ and flagged as "trivial
once 2+ real sprints exist" — that precondition is what had been missing,
not the query itself. Correctness note baked into the implementation:
points are attributed to whichever sprint a ticket's terminal state was
reached in, which for a ticket carried over mid-sprint is a *later*
sprint than the one it started in — the existing carryover logic
(`sprint_id` reassignment on `complete()`) already guarantees this is
correct without any extra bookkeeping.

Wired into the Dashboards widget system as a sixth widget type,
`velocity_trend` (migration `009_dashboards_velocity_widget.sql` widens
the `dashboard_widgets` check constraint) — rendered as a hand-rolled
inline SVG bar chart (`VelocityTrendChart` in `dashboard-widget.tsx`),
same no-charting-library approach as the existing burndown sparkline.

Live-verified against two real completed sprints in a fresh project:
created a ticket with 5 story points, added it to Sprint 1, started and
immediately completed Sprint 1 without transitioning the ticket —
confirmed it carried over and Sprint 1 correctly reports 0 completed
points; added it to Sprint 2, transitioned it through Dev → QA → Done,
completed Sprint 2 — confirmed it correctly reports 5 completed points
and no carryover. Confirmed the widget system still rejects a
non-whitelisted widget type with 400 after widening the constraint.
`tsc --noEmit` clean across `services/pm` and `apps/web`, real `next
build` clean.

This is explicitly *not* the full "general-purpose analytics-view
builder" §10 asks for (still no pick-any-metric+any-chart-type UI, just
one more entry in a fixed widget catalog) — `docs/FEATURES.md` §10 keeps
that line at 🟡, not 🟢.

## 2026-08-12 — Delivery Plans (cross-project sprint timeline)

`services/pm/src/delivery-plans` — the first cross-project view in the
platform; every prior sprint/backlog/board screen is scoped to one
project. A delivery plan is a saved `{name, project_ids[]}`; `GET
/delivery-plans/:id` (`generate()`) fans out to every sprint belonging to
any of those projects and returns them as one merged, date-sortable
"lanes" array, each tagged with its owning project's key/name and a
`scheduled` boolean (true only when both `start_date` and `end_date` are
set — an unscheduled sprint is still returned, just flagged, never
silently dropped).

Explicit scope note, not silently glossed over: ADO's Delivery Plans can
also show epic-level date bars, but this schema has no target-date
concept on epics — only sprints carry dates. What shipped is the
genuinely new part (the cross-project merge), not a fabricated epic
timeline.

Live-verified against two real projects: created a sprint with real
start/end dates in one project, reused two already-completed (dateless)
sprints from an earlier test in another project, created a plan spanning
both — confirmed the generated timeline correctly merged all three
sprints sorted by project key, correctly flagged only the dated sprint as
`scheduled: true`, and confirmed empty `projectIds` on create is rejected
with 400 and fetching a nonexistent plan 404s. `tsc --noEmit` clean
across `services/pm`.

`apps/web` UI: `app/(app)/delivery-plans` (list + create, project
multi-select checkboxes) and `.../[planId]` (a hand-rolled proportional-
bar Gantt — no charting library, same approach as the burndown sparkline
and velocity bar chart — positioned within the plan's own min/max date
span, with a separate list for unscheduled sprints below it). Added to
the top-level nav. Real `next build` clean (37 routes now), both new
pages confirmed to server-render their translated content correctly
against the real running `pm` service.

This closes the §10 "Delivery Plans" item, the item `docs/ROADMAP.md`
had flagged as "the largest remaining §10 item, genuinely new scope."

## 2026-08-12 — Advanced Security: real secret scanning on push

`services/git-host/internal/secretscan` — the first half of §1/§3/§10's
"Secret & dependency vulnerability scanning on Git push." Deliberately
scoped: secret scanning is real and shipped; dependency/CVE scanning is
explicitly NOT implemented, documented as a conscious decision rather
than an oversight — it would need a real vulnerability advisory feed
(npm audit's database, OSV, GitHub Advisory) wired in, and a hand-picked
"known bad versions" list would look like coverage while providing none.

The scanner runs real `git grep -E` against a repo's default branch
(matched against 5 patterns: AWS access key IDs, GitHub PATs, Slack
tokens, PEM private key blocks, a generic quoted-secret-assignment
heuristic), triggered from `gitSmartHTTPHandler` via a status-recording
`ResponseWriter` wrapper that detects a successful `git-receive-pack`
(push) request after `gitcgi.Serve` returns, then scans and persists
asynchronously in a goroutine — so scanning adds zero latency to `git
push` itself, matching the "don't block the caller on best-effort
follow-up work" pattern `runner.service.ts`'s `ci_minutes` metering
already established. Findings are refreshed (deleted, then reinserted)
per `(repo, branch)` on every push that touches it, not accumulated
forever, so a removed secret stops showing up. Every finding is redacted
to a few leading/trailing characters before it's ever written to
Postgres — the scan's own storage never becomes a second copy of the
secret it's reporting.

Three real bugs found and fixed while getting this working against a
real repo (all in this session's own new code, not pre-existing):
`git grep` treats a pattern starting with `-` (the private-key rule's
`-----BEGIN...`) as an unknown flag rather than a regex unless passed via
`-e`; `(?i)` inline-flag syntax and `\s` are Perl-regex constructs that
POSIX ERE (`git grep -E`'s actual dialect) doesn't support — fixed with a
`-i` CLI flag and `[[:space:]]`; and a trailing empty alternative in
`(RSA |EC |OPENSSH |DSA |)` is invalid POSIX ERE ("empty (sub)expression")
even though PCRE accepts it — fixed as `(RSA |EC |OPENSSH |DSA )?`. None
of these were caught by `go build`/`go vet`, only by actually running the
scanner against a real pushed commit.

Live-verified end to end against a real repo: pushed a commit containing
a fake AWS access key (unquoted `.env`-style), confirmed it was detected
and redacted (`AWS_AC…redacted…MNOP`, not the real value); pushed a
follow-up commit adding a fake PEM private key block and a fake quoted
API key, confirmed both new rule types matched too (3 findings total);
pushed a commit removing all three, confirmed findings dropped back to
zero — proving the refresh-not-accumulate semantics, not just detection.
`go build`/`go vet` clean.

`apps/web` UI: `app/(app)/repos/[repo]/security`, linked from the repos
list. Real `next build` clean (38 routes now), confirmed to server-render
correctly against the real running `git-host` service.

## 2026-08-12 — Artifacts/package registry (new service, npm-protocol)

`services/artifacts` (new service, port 4017 — 17th service in the
platform) — the largest remaining §10 item, and the only one this pass
built as a brand-new service rather than extending an existing one. A
real npm-registry-protocol-compatible package feed: `PUT /:package`
(publish — parses npm's payload shape, decodes the base64 `_attachments`
tarball, computes its sha1 shasum, writes bytes to local disk under
`ARTIFACTS_ROOT` — Postgres holds metadata only, same "local disk today,
object storage is the documented swap-in" pattern as data-warehouse-sync
and compliance's tenant export), `GET /:package` (metadata doc with
`dist-tags`/`versions`/`dist.tarball` URLs, built from the request's own
origin so it works regardless of what host/port the registry is actually
reachable at), `GET /:package/-/:filename` (tarball download). Auth is
the platform's normal RS256 JWT — npm's `.npmrc` `_authToken` config
sends it as a plain `Authorization: Bearer` header, so no npm-specific
auth scheme was needed.

Explicit, documented scope limits, not silently dropped: no Maven/NuGet
protocol support (npm only), and no scoped-package (`@org/name`) support
— npm URL-encodes the slash as `%2f` and this pass's single-path-segment
route doesn't decode that.

Live-verified against the **real npm CLI**, not a hand-rolled test
client — the strongest verification bar this session has used for any
feature: `npm publish --registry=...` of a real two-file package
succeeded end to end; `npm view` against the registry correctly showed
the shasum, dist-tags, and tarball URL; a real `npm install` in a
completely separate consuming project directory downloaded the tarball,
unpacked it into `node_modules`, and `require()`-ing the installed module
returned its real exported value — the full loop a real developer would
run, not a shortcut. Also verified: republishing the same version is
rejected by the real npm CLI with the same error message real npm
registries give ("You cannot publish over the previously published
versions"); a second version publishes cleanly and both show up in `npm
view <pkg> versions`; an unauthenticated request 401s; the tenant-scoped
package list only shows that tenant's packages.

`tsc --noEmit` clean. New service follows the same skeleton every other
NestJS service in this platform uses (`src/db/pool.ts`'s `withTenant`,
RS256/JWKS verify-only auth, forward-only `migrations/*.sql`) — added
`eos_artifacts` to `infra/docker/postgres-init/01-roles-and-databases.sql`
so a fresh stack boot provisions it, not just this session's manually
created database.

`apps/web` UI: `app/(app)/artifacts` — deliberately read-only (listing
what's actually landed via the real npm protocol above); there's no
publish form, matching how every real package registry UI works. Real
`next build` clean (39 routes now, 8 of 17 services with UI — also
corrected `README.md`'s service table, which had been stuck at "apps/web:
⚪ Not started" since long before this session's frontend work began).

## 2026-08-12 — TOTP-based MFA (§11.1, extreme-roadmap checkpoint begins)

First item off `docs/FEATURES.md` §11's extreme-enterprise-roadmap
checklist. `services/auth/src/mfa` — two-step enrollment (generate an
unconfirmed secret → first valid code flips `mfa_enabled` on and issues
10 bcrypt-hashed, single-use recovery codes, returned once). Login is now
MFA-aware: `POST /auth/login` returns `{mfaRequired: true, challengeId}`
instead of a token when the user has MFA enabled, and `POST /auth/mfa/
login-verify` exchanges a valid challenge + TOTP/recovery code for the
real token.

Deliberate security design choice: the login challenge is NOT a JWT
signed by the platform's real RS256 key. Every other service in this
platform trusts any structurally-valid token that key signs as a fully
authenticated request — there's no "mfa-pending, don't honor yet" concept
anywhere else in the system, so reusing the real signing key for a
pre-MFA token would mean anyone who intercepted it could replay it
against pm/cicd/any other service as a genuine access token. Instead it's
an opaque `crypto.randomUUID()` stored server-side with a 5-minute TTL,
consumed (deleted) on use — meaningless anywhere outside this one verify
endpoint, same "don't trust a token shape, trust a server-side lookup"
reasoning api-platform's API keys already use.

Used `otplib` (downgraded from its v13 default to v12 — v13's API dropped
the simple synchronous `authenticator` helper in favor of an async
crypto-plugin architecture that would have added real integration
complexity for no benefit here) for RFC 6238 TOTP generation/verification
and secret/otpauth-URI generation.

Live-verified the full lifecycle against a real running auth service and
a real generated TOTP code (computed the same way an authenticator app
would, via the same `otplib` library): enrolled → confirmed with a valid
code → subsequent login correctly returned a challenge instead of a
token → a wrong code correctly 401'd → the correct code issued a real
access token → replaying the same challenge correctly 401'd (single-use)
→ logging in again and verifying with a recovery code worked → reusing
that same recovery code correctly 401'd (single-use) → disabling with a
wrong password correctly 401'd before ever checking the code → disabling
with the correct password + a current code succeeded and status flipped
back to `enabled: false`. `tsc --noEmit` clean.

`apps/web` UI: the login page now renders an MFA code-entry step when a
challenge comes back instead of a token; `app/(app)/settings/security`
handles enrollment (manual-entry secret shown, no QR image — no new
dependency pulled in just for that when every authenticator app supports
typing a secret in directly) and disable. Real `next build` clean (40
routes now).

This closes the §10 "Artifacts" item and, with it, the entire
"Suggested next action" backlog `docs/ROADMAP.md` had been carrying
(Delivery Plans, Analytics-view builder, Advanced Security, Pipelines
Library/Task groups, Test Plans exploratory sessions, Artifacts — all six
landed this pass). Three §10 items remain honestly ⚪, not silently
dropped: Deployment groups (legacy agent-based targets, low priority —
ADO itself is deprecating this), Teams (multiple teams per project, each
with its own board/backlog view), and GitHub connections (deferred with
the rest of §9's connector framework, itself still ⚪).

## 2026-08-12 — §11.2 Agile PM batch: templates, bulk edit, watchers, dependency graph, releases, wiki tree

Six §11.2 items landed together, per the user's explicit reprioritization
of §11.2/§11.3/§11.4 to top priority. All in `services/pm`, all
live-verified against the real running service before moving to the
frontend pass:

- **Ticket templates** (`src/ticket-templates`) — pre-filled type/title/
  description for common ticket shapes. Live-verified a title override
  at creation time correctly wins over the template's own title while
  the description still comes from the template.
- **Bulk ticket edit** (`POST /tickets/bulk` on the existing
  `TicketsService`) — applies the same transition/assignee/sprint patch
  to a set of tickets, per-ticket independent success/failure rather
  than all-or-nothing. Live-verified a batch where a transition valid
  for one ticket's state failed for both tickets with the real
  state-machine error message (not a generic bulk failure), and a batch
  mixing a real ticket id with a bogus one correctly reported one success
  and one "not found" failure.
- **Ticket watchers** (`ticket_watchers` table) — notify-on-any-change
  independent of assignee. Notification delivery isn't wired yet, data
  model + API only. Live-verified watch is idempotent (watching twice
  doesn't duplicate) and unwatch works.
- **Visual dependency graph** (`GET /tickets/graph`) — nodes/edges shape
  built from the existing `ticket_links` table, which had create-only, no
  list/graph read shape before this. Live-verified empty-before/populated-
  after a real link creation.
- **Releases / Fix Versions** (`src/releases`) — named releases with a
  status lifecycle, tickets tag to a release via a new `release_id`
  column, release notes generated at read time from real tagged tickets.
  Live-verified status transition auto-sets `release_date`, invalid
  status rejected with 400, notes correctly grouped a tagged ticket by
  type.
- **Wiki page tree** — the schema/API already had `parent_page_id`; only
  the UI was a flat list. No backend change needed, just a client-side
  tree build in `apps/web`.

Also added, load-bearing for the above: `GET /tickets/:id` (no single-
ticket fetch endpoint existed before — every prior read was a list),
`GET /tickets/:id/links` (link creation existed, listing didn't). Both
registered carefully at the END of the controller's GET routes, after
`backlog` and `graph` — Nest/Express match routes in registration order
for the same HTTP method, so a catch-all `:id` param route registered
before those literal-path routes would have shadowed them.

`apps/web`: a real ticket detail page (`app/(app)/projects/[id]/
tickets/[ticketId]`) didn't exist before this pass at all — tickets were
only ever manageable inline on the backlog/board. It's now the home for
watch/unwatch, transition history, and links (with an add-link form).
Plus: `dependency-graph` (hand-rolled circular-layout SVG, no force-
directed-graph library — deterministic layout is legible enough at real
per-project link counts), `releases`, `ticket-templates` (a management
page, since the templates themselves needed somewhere to be created, not
just consumed), a checkbox-select + bulk-transition bar on the backlog
page, and a "create from template" picker there too.

`tsc --noEmit` clean across `services/pm` and `apps/web`. Real `next
build` clean — 45 routes now.

## 2026-08-12 — §11.3 Source Control: draft PRs, merge strategies, blame, cross-repo code search

`services/git-host` (Go):

- **Draft pull requests** — new `is_draft` column on `pull_requests`
  (idempotent `alter table add column if not exists`, same migration
  pattern as every other schema change in this service's hand-rolled
  `internal/db` schema string). `Create()` takes an `isDraft` flag,
  `Merge()` now explicitly rejects a still-draft PR with a clear reason
  instead of silently merging it, and a new `MarkReady()` is the only way
  to flip the flag — mirroring GitHub/ADO's model. Live-verified: created
  a draft PR, confirmed `POST .../merge` returned `{"merged":false,
  "reason":"PR is still a draft — mark it ready for review first"}`,
  called `POST .../ready`, then merged it successfully.
- **Squash / rebase merge strategies** — `Merge()` gained a `strategy`
  parameter (`"merge"` | `"squash"` | `"rebase"`, validated and rejected
  otherwise) and now dispatches to three genuinely distinct Git
  operations via a new shared `withWorktree()` helper: `performNoFFMerge`
  (`git merge --no-ff`), `performSquashMerge` (`git merge --squash` +
  an explicit commit), and `performRebaseMerge` — a real two-worktree
  rebase-then-fast-forward: `git rebase <target>` on a worktree checked
  out at the *source* branch, then `git merge --ff-only <source>` on a
  worktree checked out at the *target* branch, the same mechanics
  GitHub's "rebase and merge" button performs, not a flag variation on
  `git merge`. Live-verified against a real repo with three separate
  PRs: the no-ff merge left a visible fork in `git log --graph`, the
  squash merge landed as one new commit on `main` summarizing two source
  commits, and the rebase merge produced a fully linear history with no
  merge commit at all.
- **Git blame** — new `internal/browse.Blame()` shells out to `git blame
  --line-porcelain`, chosen specifically over the default incremental
  porcelain format because it repeats full commit metadata for every
  line rather than omitting repeats for a commit already seen — this
  makes one-line-block-at-a-time parsing possible without carrying state
  across blocks for a repeated commit. Returns per-line `{sha, author,
  authorTime, summary, content}`. Live-verified on a file that had lines
  from an initial commit, a plain feature commit, and (after the squash
  merge above landed) a squashed commit — every line was attributed to
  its true origin commit, including both squashed lines correctly
  pointing at the synthetic squash commit.
- **Cross-repo code search** — new `GET /api/code-search?q=...` fans
  `git grep -In -F -e <query>` out across every repo `repos.List()`
  returns for the caller's tenant. Deliberately a live query, not a
  persisted/indexed scan — unlike secretscan's stored findings, there's
  no "current state" to keep in sync, so nothing is written to Postgres
  for this. Live-verified: pushed a marker string into two files in a
  test repo, queried the endpoint, got both matches back with correct
  `repoName`/`filePath`/`lineNumber`.

All four required no new migration tooling — `internal/db`'s existing
idempotent schema-string approach absorbed `is_draft` cleanly. `gofmt
-l`, `go build ./...`, and `go vet ./...` all clean. Live-tested via a
real cloned/pushed repo (not just curl against empty state): `git clone`
+ `git -c http.extraHeader="Authorization: Bearer <token>"` for push/pull
against git-host's smart-HTTP endpoint, since it verifies a real bearer
JWT rather than basic-auth credentials — a plain `x-access-token@host`
clone URL doesn't work against it, `http.extraHeader` does.

`apps/web`:

- Pulls page (`repos/[repoName]/pulls`) gained a full create-PR form
  (source/target branch pickers sourced from `useBranches`, a draft
  checkbox), a draft badge + "Mark ready for review" button replacing
  the merge button while a PR is still a draft, and a per-PR merge-
  strategy `<select>` next to the merge button once it's ready.
- Files page (`repos/[repoName]/files`) gained a "Show blame"/"Hide
  blame" toggle on the file viewer that swaps the raw blob view for a
  per-line table of short SHA / author / line number / content (SHA and
  commit summary both available via `title` tooltip).
- New tenant-wide `/code-search` page — deliberately NOT nested under
  `/repos/[repoName]`, since the backend search itself isn't repo-
  scoped. Search only runs on explicit form submit, never on keystroke,
  since each query re-shells `git grep` across every repo in the tenant
  live. Linked from the top nav.

`tsc --noEmit` clean. Dev server smoke-tested against the live git-host
backend: all three new/changed routes (`pulls`, `files`, `code-search`)
compiled and returned 200 with no client-side runtime errors in the
`next dev` log.

## 2026-08-12 — §11.4: manual approval gates within a pipeline run

`services/cicd`:

- New migration `006_approval_gates.sql` adds `is_approval_gate`,
  `approved_by_user_id`, `approved_at` to `pipeline_run_steps` —
  `pipeline_runs.status` was already free-text with no CHECK constraint,
  so a new `'waiting_approval'` value needed no schema change there.
- A YAML pipeline step can now set `approval: true`. `RunnerService`
  gained an in-memory `Map<stepId, resolve>` — hitting an approval step
  inserts a `waiting_approval` row, flips the run's status to
  `waiting_approval`, and the whole `execute()` call blocks on a promise
  stashed in that map until something resolves it. This pauses the
  *entire run*, not one deployment — distinct from the environment-layer
  approval gates §4 already had (deployments/environments), which gate
  a single deployment's promotion, not a pipeline's step sequence.
- New `POST /pipelines/:id/runs/:runId/steps/:stepId/decision` (body
  `{approved: boolean}`) resolves the pending promise. Records
  `approved_by_user_id`/`approved_at` unconditionally (both accept and
  reject count as a decision), then either resumes the loop (approve)
  or fails the run fast — same "first bad thing stops the run"
  convention a real step failure already used (`break`, not continue-
  and-mark-failed).
- Explicit dedup guard: deciding on a step with no live pending-approval
  entry (never an approval gate, already decided, or a run this process
  instance never actually executed) 400s with a clear reason rather than
  silently no-op-ing.
- Known limitation, called out in the code: the pause point lives in
  this process's memory only. A service restart while a run is paused
  on an approval gate loses that pause point — the same class of
  limitation as an in-flight `docker run` step not surviving a restart
  either, since this runner has no external job queue backing it.

Live-verified against a real pipeline (`build` → `approval: true` step
→ `deploy`), triggered against the real `pr-verify-repo` created in
this session's git-host testing, with real `docker run` steps (not
simulated):
- Run paused correctly after `build` succeeded — status `waiting_approval`,
  the gate step recorded as `waiting_approval`/`is_approval_gate: true`.
- Approving resumed the run: `deploy` executed for real and the run
  reached `succeeded`, with `approved_by_user_id`/`approved_at` recorded
  on the gate step.
- A second run's rejection correctly failed the run without ever running
  `deploy` (`deploy` step never appears in that run's step list).
- Re-deciding an already-decided step correctly 400s instead of
  silently succeeding or double-resolving.

`apps/web`: `PipelineRunStep`/`PipelineRun` types gained
`is_approval_gate`/`approved_by_user_id`/`approved_at` and the
`'waiting_approval'` status value; new `useDecideApproval()` hook;
`useRun()`'s poll interval now keeps refreshing through
`waiting_approval` too (a run paused on approval isn't "done" the way
`succeeded`/`failed` are, so it still needs live polling — e.g. to pick
up a decision made from another tab). The run-detail page shows an
"Approval gate" badge and inline Approve/Reject buttons on a step
that's `is_approval_gate && status === 'waiting_approval'`, and a
"Decided <timestamp>" line once `approved_at` is set.

`tsc --noEmit` clean across `services/cicd` and `apps/web`. Dev server
smoke-tested the run-detail page against a real live `waiting_approval`
run — 200, compiled cleanly, no client-side runtime errors — then the
same run was approved via the real API and confirmed reaching
`succeeded`.

## 2026-08-12 — §11.4: pipeline YAML template library

`services/cicd`:

- New migration `007_pipeline_templates.sql` — `pipeline_templates`
  table for tenant-saved custom starters only. Built-in stack templates
  (Node.js, Python, Go, Docker build, and a "build → approve → deploy"
  example exercising the approval-gate feature above) are static
  constants in `library.service.ts`, not seeded rows — a seed row
  approach would need a backfill migration for existing tenants and
  seeding logic for every new one; a hardcoded list needs neither and
  can't drift into a tenant-edited inconsistent state.
- `GET /library/pipeline-templates` merges built-ins (stable order,
  same for every tenant) with the caller's own custom rows.
  `POST /library/pipeline-templates` upserts a custom template by
  `(tenant_id, name)`, rejecting a name that collides with a built-in.
  `DELETE /library/pipeline-templates/:id` rejects deleting a built-in
  id outright.
- Deliberately distinct from Task groups (already existed): a template
  is starter YAML you copy into the create-pipeline form and then edit;
  a task group is a live `taskGroup: <name>` reference the runner
  resolves and expands inline at run time. Picking a template doesn't
  create any binding to it — editing the copied YAML afterward doesn't
  touch the template row.

Live-verified: listed the 5 built-ins, saved a real custom template,
confirmed saving a template named "Node.js" 400s with a clear collision
message, confirmed `DELETE .../builtin-node` 400s, then deleted the
real custom template and confirmed the list shrank back to 5.

`apps/web`: new `usePipelineTemplates()`/`useSavePipelineTemplate()`
hooks. The pipeline-create form (`repos/[repoName]/pipelines`) gained a
"Start from a template…" `<select>` that pre-fills the YAML textarea
(and shows the template's description once picked) plus a "Save as
template" flow that persists the current textarea contents as a new
custom template.

`tsc --noEmit` clean across `services/cicd` and `apps/web`. Dev server
smoke-tested the pipelines page against the live cicd backend — 200,
compiled cleanly, no client-side runtime errors.

## 2026-08-12 — §11.4: self-hosted/BYO runner registration

`services/cicd`, new `src/runners/` module:

- New migration `008_runners.sql` — `runners` (name, labels, scrypt
  `token_hash`, online/offline status, last heartbeat) and `runner_jobs`
  (a queue table; `id` deliberately equals its originating
  `pipeline_run_steps.id` rather than getting its own uuid — one row per
  step either way, and reusing the id means "complete this job" and
  "complete this step" are the same identifier with no join needed).
- `token.util.ts` — no bcrypt dependency existed in this service (unlike
  `services/auth`), so runner secrets use Node's built-in `scrypt` +
  `timingSafeEqual` instead of pulling in a new package for one use
  site. A runner's bearer token is `<tenantId>.<runnerId>.<rawSecret>` —
  the tenant/runner id are embedded directly in the token rather than
  looked up, because `RunnerTokenGuard` needs to `SET LOCAL
  app.tenant_id` and query under RLS *before* it has verified anything,
  and there's no eos-owner-role connection available at request time to
  do a cross-tenant lookup first.
- `RunnerTokenGuard` — a second, separate auth path from `JwtAuthGuard`:
  a machine agent has no login session, so it authenticates with its
  own per-runner secret instead of a user JWT. Populates `req.runner =
  {tenantId, runnerId}` the same shape `JwtAuthGuard` populates
  `req.user`.
- `JobBrokerService` — the same "block on an in-memory promise, resolved
  later by an unrelated HTTP request" shape the approval-gate feature
  above already used, just with an external agent's `POST
  .../complete` on the resolving end instead of a human's Approve/
  Reject. Also holds a second, single-use map: the triggering request's
  bearer token, needed by the claiming agent to clone the repo itself
  (it's a separate machine — no shared workspace filesystem with this
  process), handed out exactly once at claim time and never written to
  `runner_jobs` or any other persisted row.
- `RunnerService.execute()` gained a `runsOn: <label>` branch: instead
  of running `docker run` locally, it calls `RunnersService.enqueueJob`
  and blocks on `JobBrokerService.waitFor(stepId)` until an agent
  reports back — same fail-fast-on-non-success handling as a local
  step.
- `POST /runners` (owner/admin only) registers a runner and returns its
  bearer token — shown exactly once, same discipline as api-platform's
  webhook secrets, this session's MFA recovery codes, and Pipelines
  Library secrets. `GET /runners` lists status/labels/last-heartbeat
  (never the token). `DELETE /runners/:id` deregisters — its token stops
  authenticating immediately since `authenticate()` looks up
  `token_hash` by a fresh DB query, not a cache.
  `POST /runners/heartbeat`, `GET /runners/jobs/next?labels=...`
  (atomic `for update skip locked` claim — two agents polling
  concurrently can't double-claim the same job), and `POST
  /runners/jobs/:id/complete` are the three agent-facing endpoints,
  all behind `RunnerTokenGuard`.
- New `services/cicd/scripts/self-hosted-runner-agent.js` — a real,
  standalone Node script meant to run unmodified on a customer's own
  on-prem/GPU box: heartbeats, polls for a matching job, clones the
  repo from git-host using the handed-off auth header, runs the step as
  a real `docker run` container (the same invocation shape
  `RunnerService` uses locally), and reports the result back. Not
  spawned by the NestJS process — a real BYO runner is a genuinely
  separate process on a genuinely separate machine.

Live-verified end to end, including running the agent script as an
actual separate OS process (not simulated in-process):
- Registered a runner (`gpu-box-1`, labels `gpu`/`on-prem`), confirmed
  its token authenticates a heartbeat and flips status to `online`.
- Started `self-hosted-runner-agent.js` for real (`node
  scripts/self-hosted-runner-agent.js`), pointed at the live cicd and
  git-host services with its own `RUNNER_TOKEN`.
- Triggered a pipeline with a local step and a `runsOn: gpu` step —
  watched the agent's own log claim the job, clone the real test repo,
  run a real Docker container, and report success; the run's step list
  correctly showed the local step's output and the remote step's output
  (`"running on the GPU box"` + a real `node -e` eval result) both
  landing in the run detail.
- Confirmed unauthenticated and garbage-token requests to
  `/runners/heartbeat` and `/runners/jobs/next` 401.
- Deregistered the runner and confirmed its token immediately stopped
  authenticating (`invalid runner token`).

`apps/web`: new `use-runners.ts` hooks and a tenant-wide `/runners`
page (not nested under a repo — any pipeline in any repo can target a
runner's label) to register/list/deregister runners, with the
shown-once token rendered in a dismissable banner. Linked from the top
nav.

`tsc --noEmit` clean across `services/cicd` and `apps/web`. Dev server
smoke-tested `/runners` against the live cicd backend — 200, compiled
cleanly, no client-side runtime errors.

## 2026-08-12 — §11.4: APM-triggered auto-rollback (§11.4 now complete)

`services/cicd`:

- New migration `009_apm_auto_rollback.sql` — `deployments` gains an
  opt-in `auto_rollback_error_rate_threshold` (numeric, null = disabled)
  set at request time; new `deployment_metrics` table holds every
  ingested sample.
- `DeploymentsService.request()` takes an optional
  `autoRollbackErrorRateThreshold` alongside the existing
  strategy/canaryStages params.
- New `recordMetric()` — the real ingestion path: inserts the sample,
  then, if it's an `'error_rate'` sample, a threshold is set, and the
  deployment is still `rolling_out`/`verifying`, calls the exact same
  `rollback()` method a human clicking "Rollback" would, with a reason
  string naming the breaching value and the threshold. No separate
  polling loop needed — the check runs synchronously inside the
  ingestion request itself, the same "on-push, not scheduled" reasoning
  `secretscan` already used elsewhere in this codebase. `listMetrics()`
  returns a deployment's last 200 samples.
- New routes: `POST /deployments/:id/metrics` (no `@Roles` restriction —
  the caller is expected to be a monitoring exporter/agent, not
  necessarily an owner/admin human) and `GET /deployments/:id/metrics`.

Live-verified against a real canary deployment (5% threshold) built on
top of this session's earlier approval-gate test run:
- Requested a canary deployment with `autoRollbackErrorRateThreshold:
  5.0` — landed `rolling_out` at the first (10%) stage.
- Pushed a healthy `error_rate: 2.1` sample — recorded, no rollback,
  deployment stayed `rolling_out`.
- Pushed a breaching `error_rate: 7.8` sample — `autoRolledBack: true`
  in the response, deployment status flipped to `rolled_back` with
  `rollback_reason: "APM auto-rollback: error_rate 7.8% exceeded
  threshold 5%"`.
- Pushed a second breaching sample after the rollback — correctly did
  NOT re-trigger (`autoRolledBack: false`), since the deployment is no
  longer in a rollable state — the guard reads the deployment's live
  status on every ingested sample, not a cached "already breached" flag.

`apps/web`: `Deployment` gained `auto_rollback_error_rate_threshold`;
new `useDeploymentMetrics()`/`useRecordDeploymentMetric()` hooks. The
deployment-request form on the environments page gained an optional
threshold input; any `rolling_out`/`verifying` deployment with a
threshold set shows it plus a small "push metric" form standing in for
what a real APM exporter would call, and an inline "Auto-rolled back"
alert appears when a push actually triggers one.

`tsc --noEmit` clean across `services/cicd` and `apps/web`. Dev server
smoke-tested the environments page against the live cicd backend —
200, compiled cleanly, no client-side runtime errors.

**§11.4 CI/CD, DevOps & LiveOps Management is now fully complete** —
all four remaining ⚪ items (manual approval gates, pipeline template
library, self-hosted/BYO runners, APM-triggered auto-rollback) shipped
and live-verified this session, joining the items already `[x]` from
earlier phases.

## 2026-08-12 — §11.1: brute-force login detection + auto-lockout

`services/auth`:

- New migration `003_brute_force_lockout.sql` — `users` gains
  `failed_login_count`, `locked_until`, `lockout_count`.
- `UsersService.recordFailedLogin()` increments the failure counter and,
  on hitting the threshold (5), sets `locked_until` from a backoff table
  (`[1, 5, 15, 30, 60]` minutes, indexed by `lockout_count` and capped)
  and resets `failed_login_count` back to 0 — the count reflects
  "failures since the last lockout episode started", not a number that
  keeps climbing forever. `lockout_count` itself never resets — that's
  what makes the *next* lockout episode longer than the last one, the
  same escalating-response shape real auth systems use instead of one
  fixed window. `resetFailedLogins()` clears the counter on a correct
  password check.
- `AuthService.login()` now checks `locked_until` *before* verifying the
  password at all — a locked account rejects every attempt regardless
  of whether the password given is actually correct, same as every real
  lockout implementation (letting a correct password through during a
  lockout would only ever stop a bot that never happens to guess right,
  which isn't the threat model). A correct password resets the counter
  immediately, independent of whether an MFA challenge still follows.

Live-verified the full lifecycle against a real account
(`dev@acme.test`, real bcrypt password reset via direct DB update the
same way this session's earlier live-testing has done for test
accounts):
- 4 bad passwords in a row — each still gets the normal "Invalid
  credentials" response (not yet locked).
- 5th bad password — response names the exact lockout expiry timestamp
  (`"Too many failed attempts. Account locked until ..."`).
- 6th attempt using the genuinely correct password while still locked —
  still rejected (`"Account temporarily locked..."`), proving the check
  runs before password verification, not after.
- Waited out the real 1-minute lockout window (an actual `sleep 70`,
  not a fast-forwarded clock) and confirmed login with the correct
  password succeeded automatically with no manual unlock step.
- Tripped a second lockout episode immediately after and confirmed the
  cooldown escalated to ~4.9 minutes (the 5-minute backoff tier),
  proving `lockout_count` correctly persisted across the first episode
  ending.

`apps/web`: the login page now renders the real backend error message
(`login.error.message`) instead of a canned "invalid credentials"
string — a lockout response naming the exact retry time was previously
being thrown away and replaced with a generic message.

`tsc --noEmit` clean across `services/auth` and `apps/web`. Verified
against the real running auth service (rebuilt via `nest build`,
rebooted, migrated against the live Postgres instance) — not just
compiled.

## 2026-08-12 — §11.1: IP allowlisting per tenant

`services/auth`:

- New migration `004_ip_allowlist.sql` — `tenant_ip_allowlist` (bare IP
  or CIDR entries). Not RLS-scoped, same reasoning `tenants` itself has
  none: it's read at login time, before any JWT (and therefore any
  `app.tenant_id` session variable) exists, so every query filters by
  an explicit `tenant_id` parameter instead.
- New `src/tenants/ip-match.util.ts` — pure-JS IPv4 CIDR/exact-IP
  matching, no dependency for one small piece of arithmetic. An
  allowlist with zero entries means unrestricted (fail-open on
  unconfigured, same stance `RolesGuard` already takes for a route with
  no `@Roles(...)`).
- `TenantsService` gained `addIpAllowlistEntry`/`listIpAllowlist`/
  `removeIpAllowlistEntry`/`isIpAllowed`; new CRUD routes on
  `TenantsController` under `/tenants/ip-allowlist`, scoped off
  `req.user.tenant_id` from the caller's own verified JWT — never a
  path param, so no caller can manage another tenant's list.
- `AuthController.login()` now passes `req.ip` through;
  `AuthService.login()` checks it against the tenant's allowlist
  *before* even looking up the user by email — an IP outside an
  enforced allowlist shouldn't get to learn whether an email exists for
  that tenant.

**Real bug caught during live verification, not a hypothetical**: the
first version's fail-open check was `ip.includes(':')` — meant to let
genuine IPv6 traffic through unevaluated. Node/Express, though,
commonly reports an *IPv4* connection as an IPv4-mapped IPv6 address
(`::ffff:127.0.0.1`), which also contains a colon. That check matched
every real IPv4 request too, silently disabling the entire allowlist
for the traffic it exists to restrict — the first live login attempt
against a configured allowlist went through when it should have been
blocked, which is what surfaced it. Fixed by unwrapping the `::ffff:`
prefix to its bare IPv4 form before the genuine-IPv6 fail-open check
runs.

Live-verified end to end, including actually locking a real login out
and back in (not just asserting the matcher function in isolation):
- Added a non-matching CIDR entry (`203.0.113.0/24`) — confirmed the
  *first* version's bug (login still succeeded, wrongly).
- Fixed the matcher, rebuilt, rebooted — confirmed login now correctly
  rejected with `"Login blocked: your network is not on this
  workspace's allowlist."`, using a real request from `127.0.0.1`, not
  a synthetic IP string.
- Removed the blocking entry directly against Postgres — the same
  recovery path a real ops team locked out by their own allowlist would
  use — and confirmed login worked again.
- Added a `127.0.0.1/32` entry and confirmed login succeeded because it
  genuinely matched this time.
- Deleted that entry via the real `DELETE` API and confirmed the list
  came back empty.

`apps/web`: new `use-ip-allowlist.ts` hooks and a Settings → "Network
access" page (linked from `SettingsNav`) to add/remove entries, with an
"unrestricted" vs "enforced" banner reflecting whether the list is
currently empty.

`tsc --noEmit` clean across `services/auth` and `apps/web`. Verified
against the real running, rebuilt, migrated auth service — including
the self-caught matcher bug above, which only a real request could have
surfaced.

## 2026-08-12 — §11.1: cryptographic signing of audit log entries

`services/auth`:

- New migration `005_audit_hash_chain.sql` — `audit_log` gains
  `entry_hash`/`prev_hash`.
- `AuditService.record()` now, inside the same transaction as the
  insert: takes a `pg_advisory_xact_lock(hashtext(tenantId))` (auto-
  released at commit/rollback, serializing chain-appends per tenant so
  two concurrent audit events can't both read the same "last" row and
  fork the chain instead of extending it), reads the tenant's current
  chain tip, computes `entry_hash = sha256(prevHash + canonical JSON of
  the row's fields)`, and stores both hashes on the row.
- New `verifyChain()` re-walks a tenant's full chain in insertion order,
  recomputing each row's hash from its stored fields and checking both
  that it matches the row's own stored `entry_hash` AND that it matches
  the next row's stored `prev_hash` — either mismatch means a row was
  edited, deleted, or reordered after the fact. Returns as soon as the
  first break is found, naming the exact row id.
- New `GET /audit-log/verify` route exposes it — no extra role
  restriction beyond being an authenticated member of the tenant, same
  as reading the log itself.
- A hash chain was chosen over per-entry signatures deliberately: no
  signing-key management needed, and it directly answers the actual
  question ("was anything altered after the fact"), not "who authored
  this row" — nothing but this service ever writes to `audit_log`, so
  authorship isn't the threat model here.

Live-verified against a freshly created tenant (`hashchaintest`) —
deliberately fresh, not reusing this session's already-heavily-tested
`acme` tenant, since pre-migration rows have no hash and would
correctly-but-confusingly show as "broken" starting from the first
post-migration row (a real, documented scope note: this feature can
only vouch for the chain from the point it started recording):
- 3 real login events (2 succeeded, 1 deliberately failed) chained
  correctly — `GET /audit-log/verify` returned `{"valid":true,
  "entriesChecked":3}`.
- Directly tampered with the middle row's `metadata` via a raw SQL
  `UPDATE` (bypassing the API entirely, simulating an attacker or rogue
  admin with direct DB access) and re-ran verify — correctly returned
  `{"valid":false,"brokenAtId":"<the tampered row's real id>","reason":
  "entry_hash does not match this row's own recomputed hash — the row
  was edited after being written"}`.

`apps/web`: new `useVerifyAuditChain()` hook (a mutation, not an
auto-refetching query — re-hashing a whole chain is a deliberate,
potentially-expensive on-demand action). The existing Activity settings
page gained a "Verify tamper-detection chain" button showing a
green "all N entries intact" or a red "tampering detected: <reason>"
result.

`tsc --noEmit` clean across `services/auth` and `apps/web`. Verified
against the real running, rebuilt, migrated auth service with a real
raw-SQL tamper, not a synthetic unit test of the hash function alone.

## 2026-08-12 — §11.5: test plans tied to releases, k6 load-test ingestion, axe-core accessibility ingestion

`services/pm`:

- New `ReleasesService.get()` + `GET /releases/:id` — no single-release
  fetch existed before this (only `list(projectId)` and `notes(id)`),
  needed so another service (qa, below) can validate a release
  reference actually names something real.

`services/qa`:

- `TestPlansService.create()` now calls pm's `GET /releases/:id` live
  over HTTP (same `PM_SERVICE_URL` + forwarded-authorization-header
  pattern `rtm.service.ts` already established for reading tickets)
  before accepting a `releaseRef` — a ref that doesn't resolve to a
  real release in this tenant is rejected with a clear 400 instead of
  silently stored as a dangling string. `list()` enriches every plan
  with its release's real name/status, fetched once per distinct
  release id referenced (not once per plan), tolerating a
  since-deleted release by rendering `release: null` rather than
  failing the whole list.
- New `load-testing` module — `k6-parser.ts` parses k6's real
  `--summary-export` JSON (the de facto standard load-testing tool's
  own report format, same "ingest what the real tool emits" discipline
  `junit-parser.ts` already established for JUnit XML), defensively
  field-by-field since k6's summary shape varies slightly across
  versions and which metrics were actually recorded. New
  `load_test_runs` table + `POST/GET /test-plans/:planId/load-tests`.
- New `accessibility` module — `axe-parser.ts` parses axe-core's real
  JSON results format (the de facto standard accessibility-audit
  tool), counting VIOLATIONS per impact level rather than affected
  nodes (a rule with 40 affected elements is one violation to fix, not
  40). New `accessibility_audits` table + `POST/GET
  /test-plans/:planId/accessibility-audits`.

Live-verified against a real project/release chain, not synthetic
fixtures:
- Created a real pm release (`v2.0 QA Test`); a test plan creation
  against a bogus release id correctly 400'd
  (`"releaseRef '...' does not name a real release"`); the same
  creation against the real release id succeeded; listing plans showed
  the release's real name (`v2.0 QA Test`) and status (`unreleased`)
  pulled live from pm, not a stored copy; re-confirmed the bogus-id
  rejection still held afterward.
- Ingested a realistic k6 `--summary-export` JSON payload (50 VUs,
  4820 requests, 1.2% error rate, p95 512.7ms, p99 980.4ms) — every
  field parsed correctly into the stored `load_test_runs` row.
- Ingested a realistic axe-core JSON payload with 3 violations spread
  across critical/serious/moderate impact levels — counts landed
  correctly (1/1/1/0), and `color-contrast`'s 2 affected DOM nodes
  correctly counted as 1 violation, not 2.

`apps/web`: `TestPlan` gained a `release` enrichment field (rendered as
a "name · status" badge instead of the raw ref string); new
`useLoadTestRuns`/`useIngestLoadTest`/`useAccessibilityAudits`/
`useIngestAccessibilityAudit` hooks. The test-plan detail page gained
two new sections — paste-and-ingest forms for k6 and axe-core JSON,
each with a results list rendering the parsed summary — and the
test-plan creation form now surfaces the real backend validation error
(e.g. the bogus-release-id rejection) instead of failing silently.

`tsc --noEmit` clean across `services/pm`, `services/qa`, and
`apps/web`. Both new services/qa modules and pm's new route were
verified against the real running, rebuilt (pm needed a `nest build` +
restart to pick up its new route), migrated services — not just
compiled.

## 2026-08-12 — §11.6: message search, threaded replies, @mentions, emoji reactions

`services/comms`:

- New migration `002_mentions_reactions_search.sql` — `message_reactions`
  (message/user/emoji composite key, so a user can't double-react with
  the same emoji) and a generated `search_vector` tsvector column + GIN
  index on `messages` (computed once at write time, not per search —
  messages are written far more rarely than a channel gets searched).
  Threaded replies needed no schema change: `parent_message_id` existed
  since `001_init.sql`, just with nothing reading it back as a grouped
  thread.
- `MessagesService.post()` gained `mentionedUserIds` — supplied
  explicitly by the caller (built from a real channel-member picker in
  the frontend), not parsed out of `@name` free text, same reasoning
  Slack/Teams's compose UIs use under the hood. Each id is validated as
  an actual channel member before a notification goes out; the author
  never notifies themselves. Wired to `services/notifications`'
  existing `POST /internal/notifications/send` via the same
  `x-internal-secret` pattern `incident-management`'s commander paging
  already established — reused a real cross-service convention, not a
  new one.
- New `thread()` — parent message + every reply pointing at it
  (`parent_message_id = parentId`), ordered.
- New `search()` — `plainto_tsquery`/`ts_rank` against the generated
  tsvector column, scoped to one channel, requiring membership same as
  every other message read here.
- New `addReaction()`/`removeReaction()` — upsert-or-noop and delete
  respectively, both returning the message's fresh per-emoji counts.
  `history()`/`thread()`/`search()` all now include each message's
  aggregated `{emoji, count, reactedByMe}[]` via a shared SQL fragment
  (`reactionsAggSql`), computed in the same query rather than N+1'd
  afterward.
- New `ChannelsService.get()`/`listMembers()` — the mention notifier
  needs the channel's name for the notification title; the frontend's
  @-picker needs the member id list (joined against the already-
  existing `useTenantUsers()` hook client-side for display names,
  rather than teaching comms about display names it doesn't own).

Live-verified against a real channel with two real users
(`owner@acme.test`, `dev@acme.test`) — not synthetic fixtures:
- Posted a message mentioning a real channel member — a real row landed
  in `notification_deliveries` (services/notifications) with the
  correct user id, a title naming the real channel, and `status:
  'no_subscription'` (correct: no push subscription registered in this
  dev environment — not a delivery failure). Confirmed a self-mention
  and a mention of a non-member both produced zero additional
  notification rows.
- Posted a threaded reply, fetched the thread, confirmed parent + reply
  both present in the right order.
- Two users reacted 👍 on the same message (count reached 2 correctly,
  not duplicated per composite-key uniqueness), a third distinct 🚀
  reaction landed separately, removing a reaction correctly dropped its
  count, and `reactedByMe` correctly differed per viewer (true for the
  reactor, false for the other user) rather than being a shared flag.
- Full-text search for a real word in a real message returned it,
  ranked; a non-matching query correctly returned an empty array.
- Caught and fixed an operational mistake mid-session: an earlier
  `pkill -f "ts-node src/main.ts"` (meant to restart just one service)
  matched and killed the just-started notifications service too, which
  is why the first mention attempt logged `fetch failed` — restarted it
  and re-ran the same live test to get a clean pass, rather than papering
  over the failed attempt.

`apps/web`: `Message` gained a `reactions` field; new
`useChannelMembers`/`useThread`/`useSearchMessages`/`useAddReaction`/
`useRemoveReaction` hooks. The channel page gained: a search box with a
results panel, an inline reaction bar per message (existing reactions
as toggleable pills + a hover "+" quick-picker), a "Reply" button that
opens a thread panel (parent + replies + its own reply box), and an
"@" button opening a picker built from real channel members (via the
existing `useTenantUsers()` hook) that appends to a pending-mentions
list sent with the next post.

`tsc --noEmit` clean across `services/comms` and `apps/web`. Dev server
smoke-tested the channel page against the live comms backend — 200,
compiled cleanly, no client-side runtime errors, rendering the actual
messages/reactions/thread data from the live tests above.

## 2026-08-12 — §11.7: budget estimation, CapEx/OpEx, vendor spend tracking

`services/bi`, new `src/budgets/`:

- New migration `002_rate_cards_and_cost_report.sql` — `user_hourly_rates`
  (one rate per tenant+user, not per-project — a contractor typically
  bills at one rate regardless of which project they logged time
  against).
- `RateCardsService` — set/list a user's hourly rate.
- `CostReportService.costReport()` — fetches a project's real tickets
  live from `services/pm` (same pattern `rtm.service.ts` already
  established), pulls real `time_entries` referencing those tickets
  within a date range, prices each entry at its logger's rate. CapEx/
  OpEx split: `feature`/`epic`-typed tickets classify as capitalizable,
  everything else as operating expense — documented explicitly as a
  useful default, not real tax/accounting advice. An entry from a user
  with no rate card is excluded from the dollar total but tallied
  separately as `uncostedMinutes`, so a report never silently
  understates itself without saying so.
- Updated `app.module.ts`'s docblock, which previously (inaccurately)
  claimed budget/CapEx-OpEx "now live in services/billing" — nothing
  had actually been built there; this is where rate cards and labor
  costing actually live now, a distinct concern from billing's
  subscription/usage metering.

`services/billing`, new `src/vendor-spend/`:

- New migration `002_vendor_spend.sql` — `vendor_subscriptions`: what
  the tenant pays OUT to third-party SaaS, explicitly distinct from
  this service's own `plans`/`invoices` (what the tenant pays IN for
  using this platform) so the two are never confused despite living in
  the same service.
- CRUD + a `summary()` grouping total monthly spend by category.

Live-verified against a real project with real tickets (not fixtures):
- Set a real $100/hr rate, logged 3h against a real `feature` ticket
  and 1h against a real `bug` ticket, ran the cost report — totaled
  exactly $400, split $300 capex / $100 opex, matching the ticket
  types exactly.
- Logged 2h from a second user with no rate card set — total correctly
  stayed $400 (not silently zero-priced into it) while `uncostedMinutes`
  correctly reported 120.
- Added 3 vendors across 2 categories ($500+$800 devtools, $150
  design) — summary correctly totaled $1300/$150/$1450; deleted one and
  confirmed the summary recalculated correctly afterward.
- Caught and fixed an unrelated operational issue while standing up
  this test: `services/pm` was failing every ticket-creation call with
  a 500 because its Redis client was pointed at the default
  `localhost:6379` instead of this session's actual Docker Redis port
  mapping — restarted it with the correct `REDIS_URL` rather than
  working around it.

`apps/web`: added the missing `billing` entry to `SERVICE_URLS` (no
billing frontend existed at all before this — out of scope to build a
full billing/invoicing UI in this pass, but the vendor-spend piece
needed the base URL). New `useRateCards`/`useSetRateCard`/
`useCostReport` hooks in `use-bi.ts`; new `use-vendor-spend.ts` hooks.
New project-scoped `/projects/[projectId]/budget` page (rate-card
management + a date-range cost report with CapEx/OpEx split and an
uncosted-minutes warning) and a tenant-wide Settings → "Vendor spend"
page (linked from `SettingsNav`), both linked from the projects list.

`tsc --noEmit` clean across `services/bi`, `services/billing`, and
`apps/web`. Dev server smoke-tested both new pages against the live
backends — 200, compiled cleanly, no client-side runtime errors.

## 2026-08-12 — §11.10: standardized health/readiness endpoints across all 17 services

Every NestJS service (16 of the 17) gained an identical `GET /health`:
new `src/health/health.controller.ts` + `health.module.ts`, generated
programmatically (same content, service name substituted) then wired
into each `app.module.ts` via a script that inserts the import and adds
`HealthModule` to the `imports: [...]` array — reviewed and typechecked
per service afterward, not blindly trusted.

- Deliberately unauthenticated (no `JwtAuthGuard`) — an orchestrator's
  readiness probe has no user session, and a health check that itself
  requires a valid JWT can't distinguish "this service is down" from
  "auth-service is down", which defeats the point when auth is exactly
  what's unhealthy.
- Requires a real `select 1` round trip against the service's own
  Postgres pool, not just "the HTTP server accepted the TCP
  connection" — a process can be up and listening while its DB pool is
  exhausted or the DB itself is unreachable, which is precisely the
  state a readiness probe needs to catch.
- A degraded DB throws a real `ServiceUnavailableException` (genuine
  HTTP 503 with the real Postgres error message in the body), not a
  200 with a `"status": "degraded"` string an HTTP-status-only probe
  would never notice.
- `services/git-host` (the one Go service, no NestJS to generate a
  module for) got the identical response shape by hand: a new
  `healthHandler` registered as `GET /health` ahead of every other
  route, explicitly NOT wrapped in `withAuth` — same reasoning as
  above — checking `db.Pool.Ping()`.

**Real bug caught live, not from code review**: `services/artifacts`
implements the actual npm registry protocol, which includes `GET
/:package` — any single path segment is a syntactically valid npm
package name, so this is a real, necessary catch-all route, not a
mistake. It was registered (via module import order) ahead of the new
`HealthModule`, and Nest/Express match same-method routes in
registration order — so `GET /health` was being swallowed by the
packages route and 401'ing against its auth instead of ever reaching
the health controller. First live curl against artifacts's `/health`
caught this immediately (`{"message":"Unauthorized"}` instead of a
health payload). Fixed by reordering `imports: [HealthModule,
PackagesModule]` with a comment explaining exactly why, matching this
codebase's existing convention of flagging route-registration-order
sensitivity wherever a catch-all coexists with literal paths (git-host's
smart-HTTP catch-all, pm's ticket `:id` routes). Audited every other
service's controllers for the same bare-`:param`-at-controller-root
shape afterward — artifacts was the only one.

Live-verified against 9 real running services (auth, pm, git-host,
comms, bi, billing, notifications, cicd, qa) — every one returned a
real `{status: 'ok', dbConnected: true, checkedInMs, uptimeSeconds}`.
Forced a genuine DB-auth failure (a throwaway instance pointed at a
wrong Postgres password) and confirmed a real 503 came back with the
actual Postgres error message, not a synthetic one. Spot-booted two
services this session had never touched before (artifacts,
incident-management) specifically to prove the generated pattern
actually generalizes rather than only working on services already
being iterated on — which is exactly what surfaced the routing bug
above.

`tsc --noEmit` clean across all 16 NestJS services; `go build ./...`
and `gofmt -l .` clean for git-host.

## 2026-08-12 — §11.9: plugin/connector framework, GitHub connector, first-party CLI

Built the plugin/connector framework (services/api-platform/src/connectors):
a static `connector_types` marketplace catalog driving a schema-defined
install form, per-tenant `connector_installs` (shown-once credential
discipline, same as API keys/webhook secrets), and `connector_sync_runs`
history. `POST /connectors/:id/sync` dispatches to a runner function keyed
by connector type — adding a new connector type is a marketplace row (data)
plus a runner (code), kept deliberately decoupled.

First real connector on the framework: GitHub issue import
(`github.connector.ts`), calling the real `api.github.com` REST API and
creating real tickets in services/pm via the established cross-service
forwarded-bearer-token pattern. Idempotent by design — re-sync matches
existing tickets via an `Imported from GitHub #<n>` marker rather than
re-importing.

Frontend: `apps/web/app/(app)/settings/connectors` — installed list
(sync/enable-disable/remove/history) + marketplace list with a
schema-driven install modal.

Also built `packages/cli` — a first-party `nexus` CLI authenticating via a
real login session (JWT cached at `~/.nexus/config.json`) and scripting
against real pm/api-platform endpoints: `login`, `whoami`, `projects list`,
`tickets list/create`, `connectors list/sync`.

**Real bugs caught+fixed live:**
- `apps/web/lib/service-urls.ts`'s `apiPlatform` default URL was `:4008`;
  the service's real default port is `:4013`. Pre-existing dead default,
  never exercised until the new connectors UI needed it live. Fixed —
  `use-webhooks.ts` (the only prior consumer) benefits too.
- Discovered (not fixed — flagged as a follow-up in FEATURES.md):
  `services/api-platform`'s `ApiKeyGuard` is fully implemented but not
  wired into any other service's controllers, so an issued API key can't
  actually authenticate a cross-service request today. The CLI works
  around this by using a real login session instead of an API key.

**Live-verified:**
- Backend: booted a fresh tenant+owner+project via real signup/bootstrap/
  login/project-create calls across auth+pm; installed the GitHub
  connector against the real public repo `octocat/Hello-World`; first
  sync imported 28 real open issues as real pm tickets (0 skipped);
  immediate re-sync imported 0/skipped 28, confirming idempotency;
  disabling the connector correctly rejected a further sync with a 400;
  removing the install cleaned up correctly (list returned empty after).
- Frontend: `tsc --noEmit` clean; booted `next dev` for real and hit
  `/settings/connectors` live — compiled and rendered 200 with no runtime
  errors.
- CLI: built and ran the actual compiled `dist/index.js` (not just
  type-checked) against the live services above — `login` obtained a real
  JWT, `whoami` reflected it, `projects list` returned the real seeded
  project, `tickets create` created a real ticket confirmed present in a
  following `tickets list`, a wrong password correctly failed with exit
  code 1 and the real backend error message surfaced, and the no-args path
  printed help with exit 0.

## 2026-08-12 — §11.8: unified semantic search, AI PR review assistant

Extended `services/ai-platform`'s existing pgvector semantic search from
tickets-only to also index wiki pages (`services/pm/src/wiki`) and chat
messages (`services/comms/src/messages`), fire-and-forget on
create/update/delete — the same pattern ticket creation already used.
New tenant-wide `apps/web/app/(app)/search` page: one query, filterable by
source type, relevance-scored excerpts, with an honest fallback-embedding
warning when no real embeddings API key is configured.

Built a real AI PR review assistant: `services/git-host/internal/
pullrequests/review.go` runs a genuine `git diff --numstat` between a PR's
two branches and applies explainable heuristics (large changeset, wide
file-touch, missing test coverage, empty diff) — explicitly NOT an LLM
call, since this repo has no configured LLM/embeddings provider; documented
inline as deterministic and honest about that, same stance as the CapEx/
OpEx and flaky-test heuristics from earlier phases. Exposed via
`GET /api/repos/{repo}/pulls/{id}/review`; the frontend renders it as an
"AI review" panel with a human-triggered "Post as comment" button — nothing
auto-comments on a PR.

Also discovered — not built new, just found and correctly marked — that
"AI-generated release notes" (`services/pm`'s `GET /releases/:id/notes`)
was already fully implemented and wired to the frontend from earlier work,
just never flagged done in FEATURES.md §11.8.

**Real bug caught+fixed:** `ai-platform/src/embeddings/embeddings.service.ts`'s
`search()` referenced SQL placeholder `$4` in its no-`sourceTypes` branch
while only binding 3 params — every unfiltered semantic search (the normal
case) 500'd with a Postgres "could not determine data type of parameter
$3" error. Pre-existing, invisible until this session's new `/search` page
issued the first real unfiltered query against it. Fixed the placeholder
index.

**Live-verified:**
- Created a real wiki page and a real chat message referencing the same
  topic; an unfiltered search correctly returned both, ranked by
  similarity; `sourceTypes=wiki_page` correctly narrowed to just the page;
  `sourceTypes=ticket` against the same query correctly returned zero
  results; pre-existing ticket search still works post-fix.
- Pushed a real feature branch and opened a real PR: a 255-line/5-file
  diff correctly did not trip the large-changeset flag but did flag
  missing test coverage; pushing further changes past 500 lines correctly
  tripped the large-changeset flag; adding a real `.test.ts` file in the
  same push correctly cleared the missing-test-coverage flag; posted the
  generated review as a real PR comment successfully.
- `tsc --noEmit` clean across ai-platform, pm, comms, and the web app;
  `go build ./...` clean for git-host.

## 2026-08-12 — §11.10: automated tests — unit-test layer started

Started closing the single largest standing quality gap called out
repeatedly throughout this build: zero automated tests anywhere in the
repo. Wired Jest (`ts-jest`) into `services/auth` and `services/bi` as the
first two, with a root `turbo.json` `test` task so `turbo run test` runs
every service's suite from the repo root in one command — verified live,
not just configured (packages with no `test` script are silently skipped
by turbo, not an error).

Scope is deliberately narrow for this pass: pure-function unit tests only,
no database or network involved in a test run — that's the honest starting
tier of the three-tier plan (unit / integration / e2e) FEATURES.md §11.10
lays out. Several of the functions under test were pulled out of private
inline logic into exported, standalone pure functions specifically to make
them testable in isolation, without changing their behavior (build +
`tsc --noEmit` + a real live login re-verified clean after each
extraction):

- `services/auth/src/tenants/ip-match.util.ts`'s `matchesAny` — CIDR/IPv4
  allowlist matching, including a regression test for the real
  `::ffff:`-prefix IPv4-mapped-IPv6 bug caught and fixed live earlier this
  build (a bare `ip.includes(':')` check had silently disabled the whole
  allowlist for real IPv4 traffic).
- `services/auth/src/users/users.service.ts`'s new `backoffMinutesFor` —
  the brute-force lockout backoff table lookup, tested for monotonicity
  and the correct cap under a sustained attack.
- `services/auth/src/audit/audit.service.ts`'s new `computeEntryHash` /
  `GENESIS_HASH` — the audit-log hash-chain function; tests assert
  determinism and, critically, that changing ANY single field (including
  `prevHash` itself) changes the hash, which is the entire tamper-detection
  guarantee.
- `services/bi/src/budgets/cost-report.service.ts`'s new
  `isCapexTicketType` / `costCentsFor` — CapEx/OpEx classification and
  cent-rounding, with one test pinned to the exact $100/hr × 3h = $300
  figure verified live against real infra during §11.7's work.

**Live-verified:** `npx jest` run directly in each service (31 passing in
auth, 8 passing in bi); `npx turbo run test` from the repo root picked up
and ran both correctly; `nest build` + `tsc --noEmit` stayed clean in both
services after the extractions; restarted both services' real running
processes post-refactor and re-confirmed a real login (auth) and a real
`/health` 200 (bi) — the refactor changed nothing observable.

**Explicitly not done yet, tracked as follow-up**: the same
extraction-and-test pattern across the other 15 services, integration
tests against the real docker-compose stack, and a Playwright e2e suite
against `apps/web`. §11.10's "CI pipeline dogfooding this repo's own
services" is the natural next step once there's enough test surface for a
pipeline run to be worth anything.

## 2026-08-12 — §11.10: automated tests extended to qa, cicd, api-platform

Extended the Jest unit-test layer started in auth+bi to three more
services: `services/qa`, `services/cicd`, `services/api-platform`.

`services/qa`'s three external-tool-format parsers (`junit-parser.ts`,
`k6-parser.ts`, `axe-parser.ts`) were already pure functions and needed no
refactor — wrote tests directly against them, including fixtures pinned to
the exact figures verified live in §11.5 (50 VUs/4820 reqs/512.7ms p95/
1.2% error rate for k6; 3 violations across critical/serious/moderate with
color-contrast's 2 nodes correctly counted as 1 violation for axe).

`services/cicd`'s `runners/token.util.ts` (scrypt secret hashing +
tenant/runner-embedded bearer token encode/decode, from §11.4's BYO-runner
work) was also already pure — tested salting behavior, timing-safe
rejection of wrong secrets, and UUID validation on decode.

`services/api-platform` needed two small extractions, same
behavior-preserving pattern as the auth/bi pass: `webhooks.service.ts`'s
HMAC signing pulled into `computeWebhookSignature`, and
`connectors/github.connector.ts`'s idempotency-marker regex logic pulled
into `alreadyImportedIssueNumbers`/`buildImportedDescription` — with a
round-trip test proving the write side (building the marker) and read
side (parsing it back out) actually agree, which is the real invariant
the GitHub connector's re-sync idempotency depends on.

**Live-verified:** `npx jest` passing in each service individually (17 qa,
10 cicd, 11 api-platform — 77 total across all 5 services with tests now);
`npx turbo run test` from the repo root ran all 5 together correctly;
`nest build` + `tsc --noEmit` stayed clean in every service after
extractions; rebuilt and restarted api-platform's real running process
post-refactor and re-confirmed a real `/health` 200.

Running tally: 5 of 17 services now have a real unit-test suite. Remaining
12 services, the integration tier, and the e2e tier are tracked as
follow-up in FEATURES.md §11.10.

## 2026-08-12 — §11.10: automated tests extended to pm

Extended the Jest unit-test layer to `services/pm`: pulled the backlog
drag-to-reorder midpoint-ranking logic out of `tickets.service.ts`'s
`reorderBacklog()` into a standalone `computeReorderRank` function and
wrote tests covering the between-two-neighbors, drop-at-top,
drop-at-bottom, empty-backlog, and narrow-gap-float-precision cases —
the last of these guards the exact float-precision limitation the
migration's own docblock already calls out.

**Live-verified:** 6 new tests passing; `nest build` + `tsc --noEmit`
clean; rebuilt and restarted pm's real running process post-refactor,
re-confirmed a real `/health` 200 and a real backlog listing call still
returning correctly; `npx turbo run test` from the repo root now runs all
6 services with test suites together (83 tests total: 31 auth, 8 bi, 17
qa, 10 cicd, 11 api-platform, 6 pm).

Remaining 11 services still need the same treatment — tracked as
follow-up in FEATURES.md §11.10.

## 2026-08-12 — §11.10: automated tests extended to 13 of 17 services

Pushed the Jest unit-test layer from 6 to 13 services in one pass:
ai-platform, incident-management, comms, artifacts, billing, compliance,
onboarding (joining the already-covered auth, bi, qa, cicd, api-platform,
pm).

Notable extractions this round:

- `ai-platform/embedding-provider.ts`'s `hashFallbackEmbedding` (now
  exported) — tests include a cosine-similarity ordering check proving
  near-duplicate text lands closer than unrelated text even under the
  dev-only hash fallback, which is the actual property semantic search
  depends on.
- `incident-management`'s new `requiresImmediatePaging` — the sev1/sev2
  auto-page-the-commander decision.
- `billing`'s new `seatLineItem`/`overageLineItem` — real invoice
  line-item math, including cent-rounding behavior on fractional overage
  rates.
- `compliance`'s `DEFAULT_BACKUP_POLICIES` and `onboarding`'s
  `DEFAULT_ONBOARDING_TASKS` (both now exported) — structural/invariant
  test suites guarding static default tables against silent regression
  (no duplicate entries, RTO never shorter than RPO, financial/audit data
  held to a real zero-RPO/7-year-retention standard).

**Real bug-shaped issue caught live:** `comms/messages.service.ts`
creates a real `ioredis` connection at module-import time. Importing it
directly from a Jest spec hung the test run indefinitely (no live Redis
reachable from the test process, and ioredis retries forever by default).
Fixed by splitting the actual pure logic (`reactionsAggSql`,
`chatRedisChannel`) into a new side-effect-free `message-sql.util.ts` that
`messages.service.ts` now imports from — the correct shape for any future
service with a module-scope client, not just a one-off workaround.

**Live-verified:** all 124 tests passing across the 13 services;
`npx turbo run test` runs them together from the repo root; `nest build`
+ `tsc --noEmit` clean everywhere after extractions; `go build ./...`
clean for git-host; rebuilt and restarted comms, ai-platform, billing,
and incident-management's real running processes post-refactor and
re-verified real traffic against each (a real chat message + reaction
round-trip for comms, a real unified-search query for ai-platform, a real
`/health` 200 for billing and incident-management).

**Deliberately left untested, and said so rather than padding coverage:**
`notifications`, `identity-federation`, `data-warehouse-sync` — checked
each for extractable pure logic; all three are thin, tightly DB/network-
coupled plumbing (SCIM upsert calls, export destination writes, push
delivery status) with nothing meaningful to unit-test in isolation without
either mocking most of the function away or waiting for the integration
test tier. `git-host`'s own `go test` unit-test tier (Go's tooling is
separate from this Jest setup) is also not started — tracked as follow-up.

Running tally: 13 of 17 services now have a real unit-test suite, 124
tests total. Remaining: 3 services + git-host's Go tests, plus the
integration and e2e tiers — tracked in FEATURES.md §11.10.

## 2026-08-13 — §11.5: cross-browser test matrix reporting

`test_executions` gained `browser`/`os` columns (default `'unspecified'` —
fail-open for callers with no matrix concept, same posture as IP
allowlisting elsewhere). `POST .../ingest-junit` now accepts them
alongside the XML (JUnit itself has no browser/OS concept — Playwright/
Selenium grids report that out-of-band). New `GET
test-plans/:planId/browser-matrix` reports each test case's most recent
status per browser/OS combination it's actually been run under — a
combination never run has no cell at all, not a fabricated "untested"
row, since the space of possible browser/OS pairs is unbounded and this
platform doesn't own that catalog. Frontend: a real matrix table
(browsers as columns, cases as rows) plus a browser/OS-tagged JUnit
ingest form on the test-plan detail page.

**Live-verified:** ingested one real JUnit XML tagged chrome/macos
(checkout flow passed, login flow failed) and one tagged firefox/linux
(checkout flow failed, login flow passed) against the same test plan —
the matrix correctly showed the exact real per-browser divergence for
both cases, not an aggregate or averaged result. `tsc --noEmit` clean,
`nest build` clean, qa's real running process restarted and the matrix
endpoint hit live post-restart; `apps/web` typechecked clean and the
test-plan detail page rendered 200 with real data flowing through
`next dev`.

## 2026-08-13 — §11.7: contractor invoicing from approved timesheets

New `services/billing` `contractor_invoices` table — a real AR document
the tenant issues to ITS OWN client for a contractor's approved hours,
distinct from `invoices` (what the tenant owes the platform) and
`vendor_subscriptions` (what the tenant pays OUT). Unique per
`(tenant_id, timesheet_id)` so regenerating an already-invoiced timesheet
is idempotent, returning the existing invoice rather than double-billing.

`services/bi`'s new `POST /timesheets/:id/generate-invoice` does the real
work: requires the timesheet to genuinely be `'approved'`, sums its real
`time_entries` minutes, prices them at the contractor's real hourly rate
(exported `RateCardsService` from `BudgetsModule`), then calls
`services/billing`'s real `POST /contractor-invoices` forwarding the
caller's own bearer token.

Frontend: new `apps/web/app/(app)/settings/timesheets` — pending-approval
list with approve/reject, a client-side "ready to invoice" section for
timesheets approved this session, and a contractor-invoice list with an
issued/paid/void status selector.

**Live-verified:** logged 8h of real time entries, set a real $150/hr
rate card, submitted and approved the real timesheet, generated an
invoice — confirmed exactly $1,200.00 (8h × $150). Re-generating the same
invoice correctly returned the identical existing record (confirmed via
the invoice list showing exactly one row, not two). Attempting to invoice
a still-draft timesheet correctly rejected with its real status in the
message. Attempting to invoice a timesheet ID belonging to a different
tenant correctly 400'd as "not found" — confirmed this was RLS correctly
refusing cross-tenant access, not a bug, by checking the row directly in
Postgres. `tsc --noEmit` clean in both services, both real running
processes rebuilt and restarted, `apps/web` typechecked clean and the new
settings page rendered 200 with `next dev`.

## 2026-08-13 — §11.10: CI pipeline dogfooding this repo's own services

This repo was `git init`'d for real (previously entirely untracked) and
pushed to two real remotes: GitHub (`github.com/krishnaditya65/Nexus`)
and, more importantly for this item, mirrored into the platform's OWN
`git-host` service as a real tenant repo (`nexus`) via a genuine
`git push` over its smart-HTTP protocol using `http.extraHeader` to
supply a bearer token (git-host's auth middleware requires
`Authorization: Bearer`, not the Basic auth a plain `user:pass@host` URL
would send).

Registered a real pipeline through `services/cicd`'s actual API
(`image: node:20`, install via `corepack` + `pnpm install
--frozen-lockfile`, then `pnpm run test` — the new root `turbo run test`
script) and triggered a real run.

**Real bug caught live by dogfooding itself**: the first run's `test`
step failed with `pnpm: not found`. Each pipeline step runs in its own
fresh, isolated `docker run --rm` container (by design — see
`runner.service.ts`'s docblock) with only the mounted `/workspace` volume
persisting between steps; `corepack enable`'s global shim activation from
the `install` step does NOT carry into a separate `test` step's
container. Fixed by making every pnpm-dependent step self-contained
(re-running `corepack prepare` in each) — the correct general pattern,
not a one-off workaround.

**Live-verified end to end** with the fixed pipeline: the re-triggered
run genuinely succeeded. `install` ran a real `pnpm install` against the
actual 19-package workspace (exit 0). `test` ran the real `turbo run
test` inside the container and its captured log shows all 13
test-bearing packages (auth, bi, qa, cicd, api-platform, pm, ai-platform,
incident-management, comms, artifacts, billing, compliance, onboarding)
executing and reporting the exact same 124/124 passing tests the local
run reports — confirmed by reading the run's actual captured step
output, not just trusting its `succeeded` status field.

## 2026-08-13 — §11.1: session management UI (list + remote sign-out)

New `services/auth` `sessions` table, populated on every real login — IP,
user-agent, created_at, last_seen_at, revoked_at/reason. Every issued JWT
now carries a `sid` claim tying it to a session row.
`JwtStrategy.validate()` (auth-service's own) checks that claim against
the session table on every request, throttled to at most one
`last_seen_at` write per session per minute.

New endpoints: `GET /sessions` (self, marks the caller's own current
session), `DELETE /sessions/:id` (self-service sign-out — a user can only
revoke their own sessions, not another user's), `POST
/sessions/revoke-others` (bulk sign-out of every other session).

**Honest, disclosed scope limitation, stated directly in the UI**: the
other 16 services verify JWTs locally via JWKS with no live channel back
to this session table, so revoking a session here does not instantly
invalidate that token against THEM — it stays technically valid there
until its natural ≤1h expiry. Same "the label does a lot of work at this
scope" honesty this codebase already applies to the CapEx/OpEx heuristic
and the flaky-test quarantine rule.

Frontend: a new section on the existing security settings page —
device/IP/last-active list, a "this device" badge, per-session sign-out,
and a "sign out all others" bulk action.

**Live-verified:** logged in twice with distinct `user-agent` headers
(simulating two devices), confirmed each session listed correctly from
the other's perspective; revoked "device 2"'s session from "device 1" —
device 2's token was immediately rejected (401 "session has been
revoked") on a further `/auth/me` call while device 1's token kept
working. Separately verified the disclosed cross-service limitation is
real rather than just prose: a revoked session's token was correctly
rejected against auth-service's own `/auth/me` but still genuinely
accepted by `services/pm`'s `GET /projects` (200) — exactly the
documented boundary. `tsc --noEmit` clean, all 31 pre-existing auth tests
still pass, `nest build` clean, auth's real running process rebuilt and
restarted, `apps/web` typechecked clean and the updated security page
rendered 200 with `next dev`.

## 2026-08-13 — §11.9: API-key guard adoption (pm ticket routes)

Closed the honest gap flagged when the `nexus` CLI was built: `services/
api-platform`'s `ApiKeyGuard` existed but wasn't wired into any other
service's controllers, so an issued `nexus_live_...` API key couldn't
actually authenticate a request anywhere on the platform.

New `POST /internal/api-keys/resolve` on `services/api-platform` — same
shared-secret internal-call trust model already used by `ai-platform`'s
`internal/embeddings` and `auth`'s `internal/federation` controllers.

New `services/pm` `TenantAuthGuard`: accepts EITHER a real session JWT
(delegates to the existing `JwtAuthGuard`) or an `nexus_live_...` API key
(resolved live against the new internal endpoint), whichever the
`Authorization` header actually carries. Applied to `TicketsController`.
An API-key-authenticated request gets a synthetic `req.user` with `sub:
null`, `role: 'api-key'` — every route already reading
`req.user.tenant_id` keeps working unchanged; an audit trail correctly
records `null` for the human actor on an API-key-driven action, since
there genuinely isn't one in the moment of the call.

**Live-verified:** real session JWT still worked on pm's ticket routes
(regression check, unaffected by the new guard). Issued a real API key
via `services/api-platform`, used it to list pm's real tickets and create
a new one (ticket #30, confirmed present in a following list call) — a
genuinely different authentication code path than the JWT one, not a
mock. Revoked the same key via the real `DELETE /api-keys/:id`; the exact
same raw key was then correctly rejected on pm with "invalid or revoked
API key" (401) — proving revocation is checked live on every call, not
cached or trusted after first use.

Deliberately partial scope: only `pm`'s ticket routes adopted the guard
this pass, not every route across all 16 other services — the same
mechanical rollout pattern (internal resolve call already exists) is
tracked as follow-up for the rest. `tsc --noEmit` clean in both services,
`nest build` clean, both real running processes rebuilt and restarted.

## 2026-08-13 — §11.7: OKRs linked to Epics

New `services/pm` `objectives`/`key_results` tables. A key result can
EITHER link to a real Epic ticket — progress computed automatically by
reusing the existing `EpicsService.rollup()` rather than duplicating its
completion-percentage query — OR track a plain manual current/target
value for outcomes that don't map to one epic. The backend actively
rejects a manual value update against an epic-linked key result (400,
not silently ignored), so its number can never drift from what the epic
actually shows.

New endpoints: `POST/GET /objectives`, `PATCH /objectives/:id/status`,
`POST/GET /objectives/:id/key-results`, `PATCH /key-results/:id/value`.

Frontend: new top-level `apps/web/app/(app)/okrs` page — objective list
with a status selector, expandable key-result lists with a progress bar,
and an add-key-result form that switches between epic-linked and manual
modes based on whether an epic ticket ID is entered.

**Live-verified end to end:** created a real epic with 4 real child
tickets, linked a key result to it (0% initially); walked 2 of the 4
children through the project's real workflow transitions
(Triage→Dev→QA→Done) — the key result automatically and correctly showed
exactly 50%, no manual input involved. Separately added a manual key
result (target 50 tickets/month), set its value to 25, correctly showed
50%. Attempting a manual update against the epic-linked key result was
correctly rejected with the real "tracks progress automatically" error
message. `tsc --noEmit` clean, all 6 pre-existing pm tests still pass,
`nest build` clean, pm's real running process rebuilt and restarted,
`apps/web` typechecked clean and the new OKRs page rendered 200 with
`next dev`.

## 2026-08-13 — §11.10: data retention & purge enforcement (chat_history)

Real, code-enforced data retention for one data class:
`services/comms`'s new `purgeOlderThan()` does a real `DELETE ... WHERE
created_at < now() - interval` against `messages` (reactions cascade,
orphaned replies get `parent_message_id` nulled rather than deleted).
`services/compliance`'s new `enforceRetention()` reads the tenant's own
configured `retention_days` for `chat_history` and calls it, recording a
real, queryable `retention_purge_runs` row.

**Explicit, honest scope**: only `chat_history` is wired up.
`audit_logs` is deliberately excluded — a plain `DELETE` would break the
hash-chain tamper-detection guarantee, and a real retention-compliant
purge there needs chain-aware archival, tracked as its own follow-up, not
this. The other data classes need their owning services to grow the same
purge-endpoint pattern. Calling `enforceRetention` for an unsupported
class fails loudly (400) rather than silently no-op'ing. No cron
infrastructure exists in this repo, so this is a real, triggerable,
on-demand action — the same documented limitation as CI's job broker and
connector syncs.

Frontend: new `apps/web` settings page — seed-defaults, per-policy
"enforce now", and purge-run history.

**Real bug caught live while building this**: `BackupPoliciesService.
seedDefaults()` called `this.list(tenantId)` from inside its own
`withTenant(...)` transaction. Since `list()` independently opens a
SEPARATE connection/transaction via its own `withTenant()`, under
Postgres's default read-committed isolation that second connection
couldn't see the first transaction's still-uncommitted inserts — seeding
a fresh tenant's defaults genuinely returned `[]` despite the rows
existing a moment later on a fresh query. Fixed by querying on the same
client the inserts ran on. Ran a full-codebase sweep via an Explore agent
afterward specifically checking every other service for the same
nested-`withTenant` pattern — confirmed none found; this was an isolated
instance.

**Live-verified:** seeded defaults on a fresh tenant, got all 5 real
policies back immediately (proving the fix — this exact call used to
return `[]` here); backdated a real message to 200 days old (past the
180-day `chat_history` default), triggered real enforcement, confirmed
exactly 1 message deleted and the channel's message count dropped from 2
to 1; purge-run history showed the real record; `audit_logs` enforcement
correctly rejected with the honest "isn't implemented for 'audit_logs'
yet" message. `tsc --noEmit` clean in both services, `nest build` clean,
both real running processes rebuilt and restarted, `apps/web` typechecked
clean and the new settings page rendered 200 with `next dev`.

## 2026-08-13 — §11.10: cost/usage observability for the platform operator

Extended every service's already-standardized `/health` response with a
real `memoryUsageMb` field — `process.memoryUsage().rss` for the 16
NestJS services (scripted patch, mechanical rollout), `runtime.MemStats.
Sys` for `git-host` (the one Go service, added by hand).

New `apps/web` settings page (`/settings/platform-ops`) polls every
service's real `/health` endpoint concurrently every 15 seconds and
reports a live table (status/uptime/memory) plus a total-resident-memory
rollup. Deliberately unauthenticated, same reasoning health checks
themselves already use — there's no tenant session to scope a
platform-operator-only view to.

**Live-verified:** rebuilt and restarted 10 real running Node services
plus git-host with the new field; curled each directly and confirmed
real, genuinely differing memory figures (auth 62MB, comms 66MB,
git-host 12MB, etc.) — not placeholders.

**Real bug hit mid-rollout, not introduced by this change but concretely
demonstrated by it**: restarting `services/auth` (its JWT signing key is
ephemeral per boot, an existing documented platform behavior) invalidated
`services/cicd`'s cached JWKS public key from before the restart — a
freshly-issued token then failed signature verification against `cicd`
until `cicd` itself was restarted to refetch the current key. Resolved by
restarting cicd; re-verified a full pipeline trigger/run round-trip
against `nexus` worked end to end again afterward.

`tsc --noEmit` clean across all 16 NestJS services, `go build ./...`
clean for git-host, `apps/web` typechecked clean and the new platform-ops
page rendered 200 with `next dev`.

## 2026-08-13 — §11.8: git-blame-informed assignee suggestion

`git-host`'s blame parser gained a real `author-mail` field — previously
it only captured the display name (`author `), which isn't a reliable
join key against `users.email`; now it also parses `author-mail ` from
git's line-porcelain blame output.

New `pullrequests.SuggestReviewers()`: blames each of a PR's changed
files as they exist on the TARGET branch (not the source — blaming the
source branch would just attribute the PR's own new lines back to its
own author, which is meaningless as a reviewer signal), capped to the 10
largest-changed files so one huge generated/vendored file in a diff can't
make this expensive or noisy, and ranks candidates by total blamed line
count across those files. New `GET /api/repos/{repo}/pulls/{id}/
suggested-reviewers`.

Frontend: a new panel on the PR page, next to the existing AI review
panel, listing candidates by name/email/blame-line-count.

**Live-verified against a real PR on this repo's own `nexus` mirror**:
cloned it, pushed a real branch (`feature/readme-tweak`) modifying
`README.md`, opened a real PR against `main` through the actual API, and
the endpoint correctly attributed `README.md`'s existing content to the
real committing author (`krishnaditya65@gmail.com`) with the correct
blame-line count — a genuine git-blame result, not a fabricated ranking.
`go build ./...` clean, git-host's real running process rebuilt and
restarted, `apps/web` typechecked clean and the PR page rendered 200
with `next dev`.

## 2026-08-13 — WebAuthn/FIDO2 passkey MFA (§11.1)

Second, phishing-resistant MFA factor alongside TOTP: `services/auth/src/
webauthn` (new `WebauthnService`/`WebauthnController`, `@simplewebauthn/
server`) + `apps/web`'s security settings page (`@simplewebauthn/
browser`). New migration `007_webauthn.sql` — `webauthn_credentials`
table, `webauthn_registration_challenges` table, and a `webauthn_
challenge` column added to the existing `mfa_challenges` table so the
login-time assertion ceremony reuses the SAME challenge row a password-
verified login already creates rather than a second parallel challenge
concept.

Registration (authenticated, Settings → Security): fetch real
`PublicKeyCredentialCreationOptions` → browser ceremony via
`@simplewebauthn/browser`'s `startRegistration` → verify → store
credential. Enrolling a passkey with no TOTP secret set still flips
`users.mfa_enabled` on. Login: the existing MFA-challenge step on the
login page gained a "Use a passkey instead" button running the
equivalent assertion ceremony against the SAME `challengeId` a password
login already issued. Credential counter checked strictly-increasing on
every authentication (defense against cloned/replayed authenticators).

**Live-verified against the real running `services/auth`** (migration
applied for real, service rebuilt/restarted, real JWT re-issued):
- `POST /auth/webauthn/register/options` → real, spec-shaped options
  payload (real random challenge, `rp.id`, `pubKeyCredParams`) for a
  zero-credential user
- `GET /auth/webauthn/credentials` → `[]` before enrollment
- `POST /auth/webauthn/register/verify` with a malformed response →
  clean 400 with the real `@simplewebauthn/server` error message
- `POST /auth/webauthn/login-options` against a nonexistent/expired
  challengeId → clean 401
- `DELETE /auth/webauthn/credentials/:id` against a nonexistent id →
  clean 400

**Honest, disclosed limitation**: unlike every other feature this build,
the full happy-path crypto ceremony needs a real browser + platform
authenticator/security key (`navigator.credentials`) — there is no
headless/curl equivalent for WebAuthn by design. Every code path
reachable without a real authenticator was live-verified above; the
full register→login round-trip needs one manual browser pass to close
out. `tsc --noEmit` clean on both `services/auth` and `apps/web`; full
`next build` succeeded including the new `/login` and `/settings/
security` bundles.

## 2026-08-13 — §12 ClickUp/Jira/ADO parity brainstorm added to docs/FEATURES.md

Per explicit ask: checked the platform against ClickUp's and Jira's
genuine differentiators that have no equivalent anywhere in §0–§11 —
multi-view (List/Calendar/Table/Workload/Mind-map), a generic
automation/rules engine, richer docs (nested pages, forms→tickets),
generic approvals + visual proofing, lightweight Goals, a notification
inbox, guest/external collaboration, dependency/critical-path tracking,
and portfolio-level program management. Added as new §12 with rough
priority tags; multi-view and the automation engine are flagged as the
highest-leverage next targets (each unlocks the most downstream
features per unit of new infrastructure). Brainstormed and documented
only — nothing in §12 is built yet.

## 2026-08-13 — Multi-view engine + automation/rules engine (§12.1, §12.2)

Two highest-leverage items from the §12 ClickUp/Jira/ADO parity
brainstorm, chosen specifically because each is one real piece of
infrastructure that unlocks many downstream features.

**§12.1 multi-view engine**: extended `services/pm`'s existing saved-query
infra (`saved_queries` gained `view_type`/`group_by` columns, new
`PATCH /queries/:id` to change them in place) rather than building a
parallel "saved views" concept — confirms the earlier prediction that one
view engine could power List/Calendar/Table/Workload without new backend
query logic. Calendar view needed a real `tickets.due_date` column, which
never existed anywhere in this schema; added it plus a new
`POST /tickets/:id/due-date` endpoint and a `dueDate` filterable field.
New `apps/web` page at `projects/[projectId]/views` renders all four view
types from the same saved query's ticket rows.

**Real bug caught live verifying this**: `node-pg`'s default `DATE`
column parser builds a JS `Date` at local midnight, which serializes back
out as a UTC timestamp shifted by the server's timezone offset —
`"2026-08-20"` round-tripped as `"2026-08-19T18:30:00.000Z"` on this
deployment's IST host. Fixed with `pg.types.setTypeParser(1082, v => v)`
in `services/pm`'s connection pool (a calendar date has no time-of-day
meaning — the fix is to never construct a `Date` from it). Confirmed the
exact string round-trips correctly after the fix, confirmed it didn't
before.

**§12.2 automation/rules engine**: new `services/pm/src/automations` —
three real triggers (`ticket_created`, `status_changed` with an optional
target-state filter, `assigned`) and four real actions (`notify_watchers`,
`notify_assignee` via the existing `services/notifications` internal push
endpoint already used by comms/incident-management; `assign_user`;
`transition`). Fires fire-and-forget AFTER the triggering ticket write's
own transaction has committed (not from inside it, avoiding the
already-diagnosed nested-`withTenant` bug class). Every firing is logged
to a new `automation_runs` table. New `apps/web` page at
`projects/[projectId]/automations` — a builder form plus per-automation
run history.

**Live-verified end to end** against a real project on real running
services: a "notify watchers on move to Done" automation fired exactly
once, only on the correct transition (QA→Done, not the two earlier
ones), and recorded `"notified 1 watcher(s)"`; a "ticket_created →
assign_user" automation correctly auto-assigned a freshly created ticket
(confirmed via re-fetch); disabling an automation stopped it from firing;
a misconfigured transition-name action recorded a clean "skipped" run
instead of crashing.

**Honest scope note**: both features are deliberately narrower than the
full §12.1/§12.2 brainstorm — Gantt/mind-map views and time-based
automation triggers (unassigned-for-N-hours, recurring tickets, SLA
timers) are explicitly out of scope, the latter because this repo still
has no cron/scheduler infra anywhere (a repeated, documented limitation).
`tsc --noEmit` clean on `services/pm` and `apps/web`; `services/pm`'s
Jest suite (6 tests) still passes; full `next build` succeeded including
the two new routes.

## 2026-08-13 — Notification inbox + generic ticket approvals (§12.6, §12.4)

**§12.6 notification inbox**: `services/notifications`'s
`notification_deliveries` table has recorded every push send since this
platform's early build (including `status = 'no_subscription'` ones with
no device to actually deliver to) — it was write-only, never exposed
back to the user. Added a `read_at` column and four self-service
endpoints (`GET /notifications`, `GET /notifications/unread-count`,
`POST /notifications/:id/read`, `POST /notifications/read-all`). New
`apps/web` `/notifications` page plus a live unread-count badge in the
main nav (polled every 20s — no cross-cutting WebSocket/SSE channel
exists to push it instead). Live-verified against real historical data:
the inbox correctly surfaced a genuine notification from §12.2's earlier
automation testing that had been sitting unexposed; unread count and
both mark-read paths confirmed against real rows; re-marking an
already-read notification is a clean no-op.

**§12.4 generic approvals**: new `services/pm/src/approvals` — a ticket
can have multiple outstanding approval requests (different approvers),
each its own row. Only the addressed approver can decide (403
otherwise); a decided request can't be re-decided (400, names the
existing decision). Both the request and the decision send a real
notification through the same `services/notifications` internal
endpoint comms/incident-management/automations already use — the first
consumer of the inbox just built besides automations. New "Approvals"
section on the ticket detail page plus a dedicated "My approvals" queue
page. Live-verified end to end: requested → listed on both the ticket
and the queue → approved with a comment → re-decide attempt correctly
400s → both notifications confirmed actually present in the real inbox
via `GET /notifications`, not just logged.

Distinct from §11.4's release/deploy approval gates (pipeline-
environment-scoped) — this attaches to any ticket at all, the ClickUp/
Jira-style generic primitive.

`tsc --noEmit` clean on `services/notifications` and `services/pm`;
`services/pm`'s Jest suite (6 tests) still passes; full `next build`
succeeded including the two new routes (`/notifications`, `/approvals`).

## 2026-08-13 — Critical-path calculation over ticket dependencies (§12.8)

New `TicketsService.criticalPath()` + `GET /tickets/critical-path` in
`services/pm` — a standard DAG longest-path over a project's `blocks`
ticket links (only `blocks`, not `duplicates`/`relates_to`, since only
`blocks` implies a sequencing constraint), weighted by story points.
Kahn's topological sort followed by a DP pass that tracks the best
predecessor into each node, so the actual chain is reconstructable, not
just its length. A real graph can contain a cycle (nothing in the
existing `link()` endpoint prevented A blocks B blocks A) — detected
naturally (cyclic nodes never reach in-degree 0 in Kahn's algorithm) and
reported as `hasCycle: true` with an empty path rather than crashing or
looping forever.

Surfaced on the existing dependency-graph page: the critical path's
nodes/edges render in red on the SVG graph, plus a plain-text chain
summary underneath.

**Live-verified**: built a real 3-ticket chain (A→B→C, story points
3/5/2) and got back the exact expected chain with `totalPoints: 10`;
then closed it into a genuine cycle (C blocks A) and confirmed the
endpoint terminated instantly with `hasCycle: true` and an empty path,
not a hang.

`tsc --noEmit` clean on `services/pm` and `apps/web`; `services/pm`'s
Jest suite (6 tests) still passes; full `next build` succeeded.

## 2026-08-13 — Forms → tickets, public and pre-auth (§12.3)

New `services/pm/src/forms` — a form whose submission creates a real
ticket with mapped fields, public or private. Public forms are reachable
with NO login, resolved through a new `resolve_public_ticket_form`
`SECURITY DEFINER` SQL function keyed by an opaque `public_token` — the
same pre-auth-lookup shape as SCIM/API-key/OIDC/status-page resolution
elsewhere in this platform, gated by `is_public = true` so a private
form's real token can't be probed into working. Submission reuses
`TicketsService.create()` directly (no duplicated ticket-creation
logic) and records a `ticket_form_submissions` row per submission.

New `apps/web` project-scoped form builder at `projects/[projectId]/
forms`, and a standalone public submission page at `app/forms/[token]`
— deliberately outside the `(app)` route group/`AuthGuard`, the same
shape as `/login`, since an anonymous submitter has no account.

This is the platform's first genuinely anonymous, pre-auth WRITE path
(every prior `SECURITY DEFINER` pre-auth lookup — SCIM, API key, OIDC,
the public status page — was a read or a credential exchange; this
creates a real row with no session at all).

**Live-verified with zero `Authorization` headers on any request in the
test**: fetched a public form's definition, submitted it, got back a
real ticket id/number, confirmed the ticket's title/description were
built correctly from the submitted fields, confirmed the submission
shows up in the form's (authenticated) submissions list with the right
submitter email; a missing-required-field submission cleanly 400s
naming the field; a bogus public token 404s; a REAL private form's real
token also 404s rather than leaking that it exists.

`tsc --noEmit` clean on `services/pm` and `apps/web`; `services/pm`'s
Jest suite (6 tests) still passes; full `next build` succeeded including
both new routes.

## 2026-08-13 — Lightweight Goals, no OKR ceremony (§12.5)

New `services/pm/src/goals` + `apps/web/app/(app)/projects/[projectId]/
goals` — ClickUp's lighter-weight Goals concept: a single target number
with a progress bar, deliberately a separate table from §11.7's OKRs
(`objectives`/`key_results`), not built on top of them. No Objective
grouping, no epic link, always manually updated — the everyday version
next to OKRs' serious business-outcome-tracking version.

`progressPercent` is computed server-side and capped at 100 for display
only (the raw `current_value` is never clamped, so overshooting past
target is still visible in the raw numbers). Reaching or passing the
target auto-flips `status` from `active` to `achieved`.

Live-verified against a real goal (target 500 signups): 0% at creation,
50% at 250, correctly auto-achieved at exactly 500, correctly capped at
100% (not 120%) after overshooting to 600.

`tsc --noEmit` clean on `services/pm` and `apps/web`; `services/pm`'s
Jest suite (6 tests) still passes; full `next build` succeeded.

## 2026-08-13 — Guest users scoped to a single project (§12.7)

New `services/auth` `users.is_guest` column (a guest is a plain
`'member'`, not a new role tier — the still-pending "custom role
builder" from §11.1 stays separate) travels in every issued JWT. New
`services/pm` `project_members` table + `ProjectGuestGuard`: a non-guest
request is NEVER checked against membership at all — every existing
tenant member keeps seeing every project exactly as before, zero
behavior change for the normal case. `ProjectsService.list()` fails
closed for a guest with no memberships. New `POST/DELETE
/projects/:id/members`, `GET /projects/:id/members` (owner/admin-gated)
and an `apps/web` Members page per project.

**Honest, disclosed scope limitation**: enforcement is wired into
`TicketsController` only — list/backlog/graph/critical-path plus a
single-ticket-by-id lookup that resolves `project_id` first. NOT
retrofitted across pm's other 20+ modules (boards, wiki, releases, OKRs,
dashboards, etc.) — explicit follow-up of the same scale as §11.1's
field/branch RBAC, not silently gapped.

**Live-verified end to end** against two real projects and a real guest
account: guest's project list correctly showed only their one project;
guest's ticket list on their project succeeded; the same call against
the other (non-member) project correctly 403'd; a direct single-ticket
fetch for a ticket in the non-member project also correctly 403'd via
the id→project_id lookup; the inviting owner's own project list was
completely unaffected.

`tsc --noEmit` clean on `services/auth` and `services/pm`; both Jest
suites (31 + 6 tests) still pass; full `next build` succeeded.

## 2026-08-13 — Cross-project budget rollup (§12.9)

New `CostReportService.portfolioCostReport()` in `services/bi` +
`apps/web`'s new `/portfolio` page. Fetches the tenant's real project
list from `services/pm` and calls the SAME `costReport()` every
per-project Budget page already uses, once per project, then sums —
deliberately not a new/duplicated aggregation query, so a portfolio
total can never drift from what each project's own report shows.

**Live-verified against two real projects with real logged time and a
real $100/hr rate card**: CONN (3h logged) reported $300, SEC (2h
logged) reported $200, and the portfolio endpoint correctly summed to
$500 across `projectCount: 2` — a genuine cross-project sum, not an
echo of one project's number.

Cross-project CAPACITY rollup (the other half of §12.9's original ask)
is explicitly NOT attempted — it needs a well-defined "currently active
sprint" concept across projects on different cadences, which doesn't
have one obvious answer, and a shaky heuristic isn't worth it just to
check the box. Logged as honest follow-up in `docs/FEATURES.md`.

This closes out the §12 build-out batch: 12.1–12.8 all shipped real,
live-verified builds this session (the higher-traffic half of each
section, every remainder explicitly disclosed as follow-up); only
12.9's PI/ART cross-team planning remains fully unbuilt, correctly
deferred as genuinely enterprise-scale-only.

`tsc --noEmit` clean on `services/bi` and `apps/web`; `services/bi`'s
Jest suite (8 tests) still passes; full `next build` succeeded.

## 2026-08-13 — SAML 2.0 SP-initiated SSO (§11.1)

Real SAML 2.0 protocol handling for `services/identity-federation`,
replacing the schema-only placeholder flagged in §0/§11.1. Built on
`samlify` (added as a real dependency, not hand-rolled XML signature
verification):

- `POST /sso-connections/saml` — tenant-admin config endpoint, JWT-guarded,
  accepts an IdP's metadata XML (the public cert + endpoints an admin
  copies out of Okta/Entra/Google Workspace's SAML app setup screen).
- `GET /sso/saml/:tenantSlug/metadata` — this tenant's SP metadata XML,
  fed to the IdP side of the trust setup.
- `GET /sso/saml/:tenantSlug/login` — builds a real SAML AuthnRequest and
  redirects via HTTP-Redirect binding.
- `POST /sso/saml/:tenantSlug/acs` — validates the IdP's signed
  SAMLResponse (signature, Conditions, audience restriction — via
  `samlify`), rejects replayed assertions via a new `saml_assertion_ids`
  table + `record_saml_assertion_id` SECURITY DEFINER function
  (`migrations/002_saml.sql` — the ACS endpoint is unavoidably pre-auth,
  same shape as the existing OIDC/SCIM pre-auth lookup functions), then
  JIT-provisions the user through the same `internal/federation/upsert-user`
  endpoint OIDC already used (now also passing `externalIdpId`).
- Tenant-admin UI shipped at `apps/web/app/(app)/settings/sso/page.tsx` —
  forms for both OIDC and SAML config, the first UI either has ever had
  (previously both were API-only, curl-configured).

**Disclosed scope**: SP-initiated flow only (every major IdP defaults to
this; IdP-initiated needs a separate relaxed-InResponseTo-validation
code path, logged as follow-up). SP AuthnRequest signing not
implemented — pending SP signing-key management, tracked alongside the
BYOK/KMS work already flagged in §0.

**Verification status — narrower than every other entry in this log**:
`nest build` (identity-federation) and `next build` (apps/web) both pass
clean, no type errors. This pass ran with Postgres/Redis infra
deliberately not started (explicit instruction: heavy Docker resource
use, code-only this round) — so migration `002_saml.sql` has not been
applied against a live database and the login→ACS→provisioning round
trip has not been curl-verified against a real IdP, unlike the
discipline used for every prior entry in this file. That live
verification — apply the migration, restart identity-federation, run a
real SP-initiated flow against a dev Okta/Entra tenant, confirm replay
rejection on a resubmitted SAMLResponse — is the explicit next step
once infra is back up. Flagged here rather than left implicit.

## 2026-08-13 — Sub-tenant isolation (§11.1)

Master-tenant divisions for `services/auth`. The isolation half of this
was already free: every service in the platform already scopes all
data access strictly by `tenant_id` under `FORCE ROW LEVEL SECURITY`,
so a division that's simply its own ordinary tenant row gets full, real
isolation from its siblings and parent automatically, across all 17
services, with zero RLS policy changes. `migrations/009_sub_tenants.sql`
adds `tenants.parent_tenant_id` (one level deep only, enforced in
`TenantsService.createSubTenant` since Postgres can't self-reference
across rows in a CHECK) plus `POST/GET /tenants/sub-tenants`.

The actual new work was governed cross-division access:
`AuthService.accessSubTenant` (owner-only, `POST
/auth/sub-tenants/:id/access`) mints an ordinary access token scoped to
the division via a JIT-provisioned "bridge user" — reusing the exact
JIT pattern `services/identity-federation` already uses for SSO
first-login rather than inventing a second provisioning mechanism —
capped at role `admin` in the division (never `owner`, so a bridging
login can't delete the division or touch its SSO config). Audited on
BOTH sides: the parent tenant's `audit_log` records that an admin
reached into a division, and the division's OWN `audit_log` records
that it was accessed by a parent-org admin — a division isn't blind to
who from the parent touched it.

Frontend: `apps/web/app/(app)/settings/divisions/page.tsx` — create a
division, "Access" mints the token and switches the browser session
into it via the existing `setSession()`, exactly like a fresh login.

**Verification status**: same disclosed scope as the SAML entry above.
`nest build` (auth) and `next build` (apps/web) both pass clean;
`services/auth`'s Jest suite (31 tests, 3 suites) still passes
unmodified. No live Postgres this pass — migration not yet applied,
full create→access→dual-audit round trip not yet curl-verified. Next
step once infra is back: apply `009_sub_tenants.sql`, restart auth,
create a real division, access it, confirm both audit_log chains
recorded the event and that the RolesGuard genuinely 403s an `admin`
(not `owner`) caller on the access endpoint.

## 2026-08-13 — §13 Jira ecosystem gap audit (docs only)

Added `docs/FEATURES.md` §13: a user supplied Jira's own 8-category
feature breakdown and asked whether it's all covered. Cross-checked
line-by-line against §0–§12 instead of assumed, and filed every real,
previously-untracked gap as a `[ ]` backlog item, grouped to match the
user's own 8 categories (13.1–13.8). Flagged an explicit priority read:
Development Panel (ticket↔commit/PR linking) and Control Chart (the
underlying `ticket_state_transitions` data already exists — pure
aggregation + a chart, no new data model) are the highest-value/
lowest-cost items; Configuration Schemes correctly folds into the
in-flight custom role builder rather than being built as a separate
system; JQL subscriptions, §12.2's time-based automation triggers, and
§12.6's digest emails all share one missing scheduler+email
infrastructure piece, worth building once rather than three times.

## 2026-08-13 — Custom role builder (§11.1 / absorbs §13.8)

Arbitrary tenant-defined roles with a granular permission-set editor,
layered ON TOP of the existing fixed owner/admin/member enum rather
than replacing it — a genuine platform-wide replacement would mean
touching every one of 17 services' `RolesGuard`; this is the honestly-
scoped first slice, same discipline as every other partial rollout this
build has done (§11.9's API-key guard, §12.7's guest enforcement).

`services/auth`: new `roles` table (`migrations/010_custom_roles.sql`,
`tenant_id`/`name`/`permissions text[]`) + `users.custom_role_id`
(nullable, `ON DELETE SET NULL` — deleting a role can never strand a
user). `RolesService`'s `PERMISSIONS` catalog is a fixed, validated
vocabulary (`tickets.create/transition/delete`, `boards.manage`,
`automations.manage`, `forms.manage`, `budget.view/edit`,
`pipelines.approve/manage`, `repos.admin`, `users.manage`,
`roles.manage`, `billing.manage`) — a role's permissions are always
checked against it, never free-form strings a UI just LOOKS like it's
enforcing. `POST/GET/PATCH/DELETE /roles` + `GET
/roles/permissions-catalog`; `PATCH /users/:id/custom-role` assigns or
clears the one custom role a user holds, deliberately never touching
the base `role` column — a custom role can only ADD a capability, never
take one away from an existing owner/admin.

Resolved and embedded as a `permissions: string[]` JWT claim at
token-issue time, same choice §12.7's `is_guest` claim made (every
other service verifies via JWKS with no live channel back to auth, so
the permission set has to travel with the token).

Reference enforcement integration in `services/pm`: new
`PermissionsGuard`/`@RequiresPermission(...)` (mirrors the existing
`RolesGuard`/`@Roles` shape exactly) swapped onto `POST /boards`
(board-layout config) in place of `@Roles('owner','admin')`. Owner/admin
still pass unconditionally — this is additive, not a restriction — and
a plain `'member'` granted `boards.manage` via a custom role can now
reach that route too, without being promoted to admin.

**Disclosed scope**: only one endpoint in one service adopted the new
guard this pass. Every other `RolesGuard`-gated route across all 17
services is unaffected and stays owner/admin-only until it adopts
`PermissionsGuard` the same way — the exact same partial-rollout shape
§11.9's API-key guard adoption already established as this platform's
pattern for "the mechanism is real and proven, full rollout is
mechanical follow-up." Frontend: `apps/web`'s Permissions settings page
gained a custom-roles section (create/list/delete a role with a
permission checkbox picker off the real catalog) and a second per-user
dropdown to assign/clear a custom role alongside the existing base-role
selector.

**Verification status**: same disclosed bar as SAML and sub-tenant
isolation above — `nest build`/`next build` clean on auth, pm, and
apps/web; auth's Jest suite (31 tests) and pm's (6 tests) both still
pass unmodified. No live Postgres this pass, so the migration hasn't
been applied and the full create-role→assign→JWT-claim→PermissionsGuard
round trip hasn't been curl-verified yet. Next step once infra is back:
apply `010_custom_roles.sql`, restart auth, create a role with just
`boards.manage`, assign it to a plain member, confirm their token
carries the permission, confirm they can now call `POST /boards` on
pm (previously a 403), and confirm an unrelated member with no custom
role still correctly 403s.

## 2026-08-13 — Control Chart, Cumulative Flow Diagram, Sprint Burnup (§13.6)

The three standard Kanban/Scrum flow charts §13's gap audit flagged as
missing, all pure aggregation over data this platform already records
— no new data model for any of them.

`services/pm`: new `GET /tickets/flow-metrics?projectId=` —
`TicketsService.flowMetrics()` bulk-fetches every ticket in a project
plus its FULL `ticket_state_transitions` history in one call (grouped
by ticket, one query for tickets + one `= any(...)` query for all their
transitions — avoids an N+1 fetch from the consuming service).

`services/bi`: new `FlowMetricsService` — `controlChart()` computes
cycle time (first transition → terminal state) and lead time (creation
→ terminal state) per completed ticket, flags outliers at `mean +
2×stddev` of the project's own cycle times (an explicitly documented
SPC simplification, not a true XmR chart — same honesty this build
already applies to the flaky-test-quarantine and CapEx/OpEx
heuristics). `cumulativeFlow()` reconstructs each ticket's state as of
every day since the project's earliest ticket by walking its
transition list, then counts tickets per state per day. `burnup()` (new
method on the existing `SprintBurndownService`, alongside `burndown()`)
plots completed points against total scope, disclosing that "scope as
of day N" is approximated from ticket `created_at` rather than a
separately-tracked sprint-membership-changed-at timestamp the schema
doesn't have.

`apps/web`: new `/projects/:id/flow-metrics` page — a scatter-plot
control chart with a dashed UCL line and enlarged/red outlier points, a
stacked-polyline CFD with a state legend, and a sprint-picker-driven
burnup chart. All hand-rolled inline SVG, the same no-charting-library
discipline as every other chart already in this codebase.

Also fixed a **mis-scoping in §13's own gap audit**: Sprint Goals was
filed as `[ ]` unbuilt, but `sprints.goal` has existed in the schema
and `POST /sprints` API since the platform's very first sprints
migration — the actual gap was narrower, just that the frontend's
create-sprint form never exposed an input for it. Corrected in
`docs/FEATURES.md` rather than left wrong, and closed for real: the
backlog page's sprint form now has a goal field, and each sprint card
displays its goal when set.

**Verification status**: same disclosed bar as every other item this
session — `nest build`/`next build` clean on pm, bi, and apps/web; pm's
Jest suite (6 tests) and bi's (6 tests) both still pass unmodified. No
live Postgres this pass, so none of this has been curl-verified against
real transition data yet.

## 2026-08-13 — Development Panel (§13.5) + first git-host Go test

The single most-used Jira+VCS integration point, previously entirely
absent: tickets and PRs/commits were two islands connected only by a
human manually pasting a link in a description.

`services/git-host`: new `internal/devpanel` package — a Jira-style
ticket-key regex (`\b[A-Z][A-Z0-9]{1,9}-\d+\b`, matching the exact
`{project.key}-{ticket_number}` shape `services/pm`'s own UI already
displays) applied to commit subjects and PR titles. Commit scanning
happens inside the existing async push handler (`scanAndPersist`,
already running the secret scan after every push) — extended to fetch
50 recent commits instead of 1, shared between both the security-
findings commit-SHA attribution and the new dev-panel scan, so it's one
`git log` doing double duty, not two. PR-title scanning happens once at
PR creation. Both persist via `on conflict do nothing` against new
`commit_ticket_links`/`pr_ticket_links` tables — idempotent across
overlapping push ranges, same shape as §11.9's GitHub connector sync.
New tenant-wide `GET /api/dev-panel/{ticketKey}` (cross-repo, mirrors
`code-search`'s tenant-wide shape) returns every linked commit and PR;
an unknown ticket key returns two empty arrays, not a 404.

`apps/web`: new "Development" section on the ticket detail page —
linked PRs (status/draft badge, repo, source→target branch) and
commits (short SHA, subject, author), or an explanatory empty state
telling the viewer how linking actually works.

**Disclosed heuristic, not a guaranteed-correct parse** (same honesty
as secretscan's rule patterns): a commit/PR referencing a ticket
without the exact `KEY-123` shape won't be found; a coincidentally
similar string with no real ticket behind it just links to a key
nobody ever queries — inert, not a false "this is linked" claim
anywhere a human would see it.

Also: **first real test in git-host's own Go test tier**
(`internal/devpanel/devpanel_test.go`, 8 cases spanning the regex's
true/false positive and negative boundaries) — §11.10 has flagged
git-host's `go test` tier as "a distinct, not-yet-started follow-up"
since the Jest rollout across the other 13 services; this is that
follow-up's opening slice, not full coverage of the other 9 packages.
`go build ./...`, `go vet ./...`, `go test ./...` all clean.

Correctly did NOT claim deployment tracking or feature-flag status on
the ticket as built — both were flagged as dependent on this landing
first, and remain genuinely open follow-up (§13.5's remaining two
items), not silently folded into "done" just because their
prerequisite shipped.

**Verification status**: same disclosed bar as every other item this
session — code compiles/vets/passes its new unit tests, but the full
push→scan→link→dev-panel-query round trip has not been curl-verified
against a real running git-host + Postgres this pass.

## 2026-08-13 — Deployment tracking on the ticket (§13.5)

The natural follow-up to the Development Panel above, now that a
linked PR carries a real (repo, source branch) pair to query against.

`services/cicd`: new `DeploymentsService.listByBranch()` (`GET
/deployments/by-branch?repoName=&branch=`) — `deployments ->
pipeline_runs -> pipelines -> environments`, filtered to one repo+
branch, ordered by environment promotion position. Reuses the existing
`currentTrafficPercentage()` pure function for canary/blue-green stage
math rather than recomputing it a second way.

`apps/web`: new `PrDeploymentStatus` component in the ticket detail
page's Development section, one per linked PR — a small standalone
component rather than inlined into the PR list's `.map()`, since
`useBranchDeployments` is a hook and hooks can't run inside a loop
body. Renders a colored badge per environment the branch has reached,
with live traffic percentage.

Closes 2 of §13.5's 3 sub-items (Dev Panel + deployment tracking);
feature-flag-on-ticket needs a ticket↔flag association that genuinely
doesn't exist yet (flags associate to an environment only today) and
stays correctly open rather than forced in.

**Verification status**: `nest build`/`next build` clean, cicd's Jest
suite (10 tests) still passes unmodified; not yet curl-verified against
real deployment data (no running infra this pass).

## 2026-08-13 — Feature-flag status on the ticket (§13.5, closes the section)

The third and last §13.5 sub-item. Unlike commit/PR linking (a regex
scan), a flag key and a ticket key share no naming convention worth
inferring from, so this is an explicit admin-linked association:
`services/cicd`'s new `flag_ticket_links` table (migration
`010_flag_ticket_links.sql`) + `FeatureFlagsService.linkTicket()`
(`POST /feature-flags/:key/link-ticket`, owner/admin-gated, same tier
as defining a flag at all) and `listByTicket()` (`GET
/feature-flags/by-ticket?ticketKey=`, returning every linked flag WITH
its full per-environment target list in one call).

`apps/web`: a "Feature flags" subsection on the ticket detail page's
Development section — per-environment on/off badges with rollout
percentage where set, or the flag's plain default when no environment
override exists, plus a small link-by-key form.

This closes all three §13.5 sub-items (Development Panel, deployment
tracking, feature-flag status) started three commits ago in this same
session.

**Verification status**: `nest build`/`next build` clean, cicd's Jest
suite (10 tests) still passes unmodified; not yet curl-verified against
real flag data (no running infra this pass).

## 2026-08-13 — Workflow Conditions, Validators, Post Functions (§13.1)

The real Jira construct §12.2's automation engine only partially
covered. The distinction that matters: automations are event-driven
and fire-and-forget AFTER a transition has already committed; these
three run SYNCHRONOUSLY as part of `TicketsService.transition()`
itself and can actually BLOCK the transition or change what else
happens the moment it does — a genuinely different mechanism, not the
same engine wearing a different trigger.

`services/pm`: migration `021_workflow_logic_gates.sql` adds
`conditions`/`validators`/`post_functions` jsonb columns to
`workflow_transitions`, validated at the application layer against a
fixed, bounded vocabulary (same discipline as the custom role
builder's `PERMISSIONS` catalog) — Conditions: `assignee_only`,
`role_in`; Validators: `field_required`; Post Functions: `assign_user`,
`clear_field`, `set_field`. All three exposed as pure, independently
testable functions (`evaluateConditions`, `evaluateValidators`,
`applyPostFunctions`), wired into `transition()` in the correct order
(conditions → validators → the actual UPDATE, with post-functions'
field changes applied atomically in that same UPDATE) — a failed
condition or validator throws before any write happens, never a
partial state change.

Config surface (`GET /projects/:id/workflow-transitions`, `PATCH
/projects/workflow-transitions/:id`, owner/admin) was built alongside
the schema, not left for later — the exact trap the Sprint Goals
mis-scoping earlier in this backlog fell into (real schema, no way to
ever set it), caught proactively here instead.

`bulkUpdate()` and the transition HTTP handler now thread the real
caller (userId + role) through to `transition()`, previously untracked
at that layer — required for `assignee_only`/`role_in` conditions to
have anything to check against.

`apps/web`: new `/projects/:id/workflow` page — one card per
transition, three editable lists (chips + remove button) with a
type-appropriate add form each.

**Test coverage**: 14 new unit tests across the three pure functions
(`tickets.service.spec.ts`, now 20/20 passing, up from 6) — covers both
branches of each condition/validator type, multi-post-function
ordering, and the "no gates configured" pass-through case.

**Verification status**: `nest build`/`next build` clean; not yet
curl-verified against real transition data (no running Postgres this
pass).

## 2026-08-13 — Swimlanes on boards (§13.2)

Horizontal board rows by assignee or epic — pure aggregation, no new
schema, same "the data already existed" shape as §13.6's Control
Chart/CFD. `BoardsService.getBoard()` gained a `groupBy: 'assignee' |
'epic' | null` parameter reusing columns `tickets` already had
(`assignee_user_id`, `parent_ticket_id`).

**Zero behavior change when `groupBy` is omitted** — the response is
the exact same `{columns}` shape every existing caller already gets;
only passing `groupBy` switches to `{groupBy, swimlanes: [{key, label,
columns}]}`, each swimlane internally shaped exactly like the flat
board so the frontend's per-column rendering is reused, not
duplicated. Epic grouping resolves parent-ticket titles in one extra
query (not N+1); assignee grouping leaves user-id→name resolution to
the frontend, which already holds the tenant user list.

`apps/web`: a "Group by" selector on the board page (None/Assignee/
Epic); swimlane rendering factored into a shared `BoardColumns`
component.

**Disclosed scope**: not JQL-filter-defined lanes (a custom "Expedite"
lane by arbitrary query) — a materially larger feature left as further
follow-up; assignee/epic cover Jira's two most common defaults.

**Verification status**: `nest build`/`next build` clean, pm's Jest
suite (20 tests) unaffected; not yet curl-verified against real board
data (no running Postgres this pass).

## 2026-08-13 — Typed custom fields + per-screen layouts (§13.1, closes the section)

A new DEFINITION layer (`custom_field_definitions`, migration
`022_custom_field_definitions.sql`) on top of `tickets.custom_fields`,
which stays exactly the untyped jsonb blob it always was — a ticket's
values are still keyed by definition id in that same column, so every
existing reader (workflow validators' `field_required` check,
automations, forms) keeps working unmodified. Fixed, validated type
vocabulary — `text`/`number`/`date`/`checkbox`/`select`/`multiselect`/
`user_picker` — same discipline as the custom role builder's
PERMISSIONS catalog and the workflow logic gates' condition/validator/
post-function types, scoped to a project and optionally to specific
issue types.

Pure, unit-tested validation (`validateFieldValue`/`validateFields`,
new `custom-fields.service.spec.ts`, 11 tests) checks a proposed value
against its definition's type before any write reaches the database.
New write path: `TicketsService.setCustomFields()` merges rather than
replaces (so a direct edit can coexist with a value a workflow
post-function previously set) — `POST /tickets/:id/custom-fields`,
surfacing a `BadRequestException` naming the specific field(s) that
failed.

**Per-screen layouts**: `custom_field_screens` maps which defined
fields (and in what order) render on the create vs edit screen, per
issue type — a field can exist without being on any screen yet.

Admin config: `GET/POST /projects/:id/custom-fields` (definitions,
owner/admin to write) + `GET/POST /projects/:id/custom-fields/screens`
(layout, owner/admin to write); new `apps/web/.../custom-fields` page
(field catalog + screen builder, checkbox-driven). Ticket-facing: a new
"Custom fields" section on the ticket detail page renders whatever the
ticket's issue type has on its edit screen, typed to each field's
`field_type` — checkbox/select/multiselect/date/number/text all get
distinct widgets — posting through the same validated write path.

**Verification status**: `tsc --noEmit`/`nest build`/`next build`
clean, pm's Jest suite (31 tests, up from 20) passes; not yet
curl-verified against real ticket data (no running Postgres this
pass).

## 2026-08-13 — Visual workflow designer (§13.1, closes the section)

A drag-and-drop state-graph editor, deliberately separate from the
existing `.../workflow` page (Conditions/Validators/Post-Functions —
edits logic on an already-existing transition, not the graph itself).

Backend: `ProjectsService` gained `createWorkflowState`/
`updateWorkflowState`/`deleteWorkflowState` — delete is a hard-blocked
`BadRequestException` if any ticket currently sits in that state,
never an orphaned foreign key — plus `createWorkflowTransition`/
`deleteWorkflowTransition`. Reuses the existing `workflow-states`/
`workflow-transitions` GET endpoints as this editor's read side too;
new `POST/PATCH/DELETE /projects/:id/workflow-states[/:stateId]` and
`POST/DELETE /projects/:id/workflow-transitions[/:transitionId]`,
owner/admin only.

Frontend: new `apps/web/.../workflow-designer` page — SVG canvas,
states as draggable rectangles (initial/terminal visually
distinguished), transitions as arrows with click-to-delete labels;
click one state then another to create a transition. Node position is
deliberately NOT new schema — `workflow_states` gained no x/y columns,
position is presentation, not workflow semantics — a client-side
auto-layout on first load persisted to `localStorage` per-project so a
manual drag survives a reload; losing it (private browsing, different
device) just re-triggers the same deterministic layout, never data
loss, since the graph itself lives server-side. Cross-linked with the
logic-gates page in both directions.

**Closes §13.1** (Core Issue Tracking & State Management) — all three
items (workflow logic gates, typed custom fields + screens, visual
designer) now shipped.

**Verification status**: `tsc --noEmit`/`nest build`/`next build`
clean, pm's Jest suite (31 tests) unaffected; not yet curl-verified
against real state-deletion-blocked-by-ticket behavior (no running
Postgres this pass).

## 2026-08-13 — Scheduler + email infra, first wired to saved-query subscriptions (§13.3)

This platform's first real cron and first real SMTP transport — not
stubs. Before this, `data-warehouse-sync.export_destinations.schedule_cron`
and `compliance`'s backup-policy enforcement were cron-shaped COLUMNS
nothing ever read on a timer, and digest emails (§12.6) / scheduled
query subscriptions (§13.3) were both explicitly blocked on both
pieces of infra not existing anywhere in this repo.

**Scheduler**: new `services/notifications/src/scheduler` —
`@nestjs/schedule`'s `@Cron(EVERY_HOUR)` running in-process on that
service's own event loop, hosted there (not `pm`) because a scheduler
is cross-cutting infra, same reasoning that already put push delivery
there.

**Email**: new `services/notifications/src/email` — `EmailService`
wraps a genuine `nodemailer` SMTP transport, configured entirely from
env vars (`SMTP_HOST`/`PORT`/`USER`/`PASS`/`FROM`) so any SMTP-speaking
provider drops in via config, no code change. Dev-safe fallback,
explicitly disclosed: with `SMTP_HOST` unset (true this pass), `send()`
logs the fully-composed email instead of attempting delivery — never a
silent no-op or a faked "sent" status. `POST /internal/email/send`,
`x-internal-secret` gated, same trust model as this service's existing
push-send internal endpoint. Resolves a userId to an address via a new
`services/auth` internal endpoint, `GET /users/internal/:tenantId/:userId/email`
(email + display name only — never role/password_hash).

**First wired consumer — pm's saved-query subscriptions**: migration
`023_saved_query_subscriptions.sql` adds `saved_query_subscriptions`
(hourly/daily/weekly cadence) plus a `SECURITY DEFINER`
`list_due_subscriptions()` function — the cross-tenant "what's due"
scan a normal RLS-scoped connection is structurally unable to do
itself (same pattern as SAML ACS / public form resolution). Each due
row then goes back through a per-tenant `withTenant(tenantId, ...)`
connection to actually run the saved query and advance `last_run_at`.
New `SubscriptionsService`/`SubscriptionsController`:
`POST/GET/DELETE /subscriptions` (user-facing) +
`POST /internal/subscriptions/run-due` (the cron's entry point, called
by notifications's `SchedulerService` every tick).

`apps/web`: a "Subscribe…" cadence picker on each saved query
(queries page) and a subscriptions list showing last-run time.

**Disclosed scope**: the other two pre-existing cron-shaped columns
this infra could now drive (`export_destinations.schedule_cron`,
compliance backup-policy enforcement) are left as fast-follow — now
"call another internal endpoint," not "invent scheduler infra" — not
built this pass. Time-based automation triggers (§12.2) are similarly
unblocked but not yet implemented; tracked separately in
docs/FEATURES.md rather than folded into this item's "done" claim.

**Verification status**: `tsc --noEmit`/`nest build` clean across
pm/notifications/auth, `next build` clean, pm's Jest suite (31 tests)
unaffected. This cron job has never actually ticked against a running
pm service — no Docker this pass — a materially different claim from
"tested."

## 2026-08-13 — Advanced Roadmaps auto-scheduling + epic Gantt timeline (§13.4)

Both §13.4 items, built together since the Gantt view is the natural
place to look at what auto-scheduling computes.

**Auto-scheduling**: `services/pm/src/roadmap/auto-schedule.ts`'s
`computeAutoSchedule` — a dependency-free pure function, Kahn's
topological sort (an epic can't start until every epic that blocks it,
via `ticket_links`, has finished) + greedy capacity bin-packing
(epics packed into one shared points-per-sprint ledger in priority
order; oversized epics span multiple sprints). 10 new unit tests:
packing, spillover, cross-sprint spanning, dependency ordering,
out-of-set dependency ids, cycle detection (scheduled last with a
warning, not a hard failure), zero-point epics, non-positive velocity.
Deliberately not a full critical-path/resource-leveling solver — one
shared pool, hard dependency ordering, greedy first-fit.

`RoadmapService` wires it to real data: epics + child story-point
totals for a delivery plan's projects, `blocks` edges between epics in
that set, a computed shared velocity (average of each project's last 5
completed sprints, reusing `sprints.getVelocityTrend`'s query shape) or
an explicit override. Preview (`GET .../auto-schedule`, any member,
never writes) vs apply (`POST .../auto-schedule/apply`, owner/admin,
writes each epic's computed end date to `tickets.due_date` — reused
schema, no new column) are deliberately split, same "compute first,
persist only on confirmation" discipline used everywhere else in this
build a computed result could clobber real data. `apps/web`: an
"Auto-schedule" section on the delivery-plan detail page — compute,
review warnings, confirm-gated apply.

**Epic Gantt timeline**: closes the gap flagged at §11.2 ("the rollup
half shipped, the visualization half didn't"). New
`apps/web/.../projects/[projectId]/roadmap` page reuses the delivery-
plan detail page's hand-rolled proportional-bar approach one level up,
at epic granularity — bars span `created_at` → `due_date` (both
already existed; `EpicsService.rollupAllEpics` extended to return
them, no new schema), overdue-and-incomplete epics render red, a
"today" marker line, unscheduled epics (no due date) list separately.
Disclosed approximation: "start" is `created_at`, not a real planned-
start date — honest about standing in for a column that doesn't exist.

**Verification status**: `tsc --noEmit`/`nest build` clean, pm's Jest
suite (41 tests, up from 31) passes, `next build` clean; neither item
curl-verified against real delivery-plan/epic/velocity data (no
running Postgres this pass).

## 2026-08-13 — Branded customer self-service portal (§13.7)

Turns §12.3's public Forms→tickets (pre-auth ticket CREATION only)
into a fuller portal: the same public form link now has three tabs —
submit a request (unchanged), track past requests, browse the
project's public KB. Deliberately not a full portal-user account
system — identity stays exactly what Forms already established: the
email a requester typed in, matched against
`ticket_form_submissions.submitter_email`.

Migration `024_customer_portal.sql`: additive `wiki_pages.is_public`
column, plus two new `SECURITY DEFINER` functions (same shape as
`resolve_public_ticket_form`) both scoped by the form's
`public_token` — `list_public_requests(token, email)` and
`list_public_kb_articles(token)`.

New endpoints: `GET /forms/public/:token/my-requests?email=`,
`GET /forms/public/:token/kb`; `PATCH /wiki-pages/:id/public`
(authenticated, toggles a page's portal visibility).

`apps/web/app/forms/[token]` (outside the authenticated route group,
unchanged placement) gained a 3-tab layout; the wiki page detail view
gained a "Public (visible on customer portal)" checkbox.

**Verification status**: `tsc --noEmit`/`nest build` clean, pm's Jest
suite (41 tests) unaffected, `next build` clean; not yet
curl-verified against real form/wiki data (no running Postgres this
pass).

## 2026-08-13 — Problem Management (§13.7)

ITIL-style root-cause tracking, genuinely distinct from Incident
response (hours-long restore-service workflow) and from a single
incident's own `postmortems` row (a standalone, longer-lived
investigation that can span several incidents). New `problems` table
(`services/incident-management/migrations/002_problems.sql`, this
service's first migration since its initial one) — fixed status
vocabulary `new`/`investigating`/`known_error`/`resolved`/`closed`
(`known_error` is real ITIL terminology), `root_cause`, `workaround`,
`action_items` (same jsonb shape as `postmortems.action_items`).
Linking is a new nullable `incidents.problem_id` FK, not a join table
— many incidents can share one root-cause problem.

`ProblemsService`: create/list (status-filterable)/get (with linked
incidents)/update (stamps `resolved_at` once, never clobbers it)/
`linkIncident`/`unlinkIncident`. New endpoints under `/problems`.

**This is `services/incident-management`'s first-ever frontend** — the
service had been API-only since its introduction. New
`apps/web/app/(app)/problems` list+create page and
`/problems/[problemId]` detail page.

**Verification status**: `tsc --noEmit`/`nest build` clean,
incident-management's existing Jest suite (3 tests) unaffected,
`next build` clean; not yet curl-verified against real incident/
problem data (no running Postgres this pass).

## 2026-08-13 — Asset Management / CMDB (§13.7)

A real, queryable asset registry, distinct from `services/onboarding`'s
pre-existing `device_provisioning_records`/`license_assignments`
(event logs, no persistent queryable entity). New `assets` table
(`services/onboarding/migrations/002_assets.sql`, this service's first
migration since its initial one) — fixed `asset_type`
(hardware/software_license/server) and `status` lifecycle
(in_stock/in_use/maintenance/retired), optional user assignment,
serial number, purchase date, warranty expiry, and a loose nullable
link back to the onboarding task that provisioned it. Deliberately
lightweight — no CI relationship graph, no discovery agents.

Ticket↔asset linking (`asset_ticket_links`) reuses cicd's
`flag_ticket_links` shape — a bare `ticket_id` with no FK (cross-
service), denormalized `ticket_key` for display. `AssetsService`:
create/list (filterable)/get (with linked tickets)/update/linkTicket/
listByTicket. New endpoints under `/assets`.

First frontend for the registry: `apps/web/app/(app)/assets` list+
create page and `/assets/[assetId]` detail page; the ticket detail
page gained a "Linked assets" section (same pattern as its existing
Feature flags section).

**Verification status**: `tsc --noEmit`/`nest build` clean,
onboarding's existing Jest suite (3 tests) unaffected, `next build`
clean; not yet curl-verified against real asset/ticket data (no
running Postgres this pass).

## 2026-08-13 — Platform-enforced 2FA policy (§13.8) — closes the §13 gap audit

An owner-level toggle (`tenants.mfa_required`, migration
`011_mfa_required.sql`) requiring MFA for every user in the tenant,
not just the self-service opt-in that already existed (TOTP,
WebAuthn). Enforced inside `AuthService.login()`, checked AFTER
password verification succeeds (never leaks whether MFA is required
via a different error). A correct password from an unenrolled user on
an MFA-required tenant gets no real access token — only a 5-minute,
narrowly-scoped enrollment token (`role: 'unenrolled'`, no
permissions) returned as `{ mfaEnrollmentRequired, enrollmentToken }`.

**Disclosed scope limitation**: every service verifies JWTs
independently via JWKS with no live channel back to auth — making
this token provably inert everywhere outside the enrollment endpoints
would require updating all 16 services' JWT strategies, out of scope
this pass. What's actually enforced: 5-minute expiry, no permissions,
an unmatched role. Disclosed as a narrower guarantee, not claimed
airtight.

`GET/POST /tenants/mfa-required` (read: any user; write: owner only).
Frontend: a toggle on the security settings page; the login page
handles the new response shape and redirects to a new
`apps/web/app/mfa-setup` page (outside the authenticated route group)
that drives the existing TOTP enroll/confirm flow with an explicit
`authorization` header override.

**Verification status**: `tsc --noEmit`/`nest build` clean, auth's
existing Jest suite (31 tests) unaffected, `next build` clean; not yet
curl-verified against a real enforced-tenant login round trip (no
running Postgres this pass).

---

This closes out every item in the §13 Jira-ecosystem gap audit that
was scoped as buildable this session (§13.1–§13.4 fully, §13.7 fully
except the already-tracked §12.2 SLA-generalization remainder, §13.8's
2FA item). §13.5/§13.6 closed earlier in this session. §13.3's
free-text JQL-equivalent query language and time-based automation
triggers, and §13.6's already-noted items, remain open and tracked.

## 2026-08-13 — Field-level, branch-level, and budget-visibility RBAC (§11.1)

Three related but distinct RBAC gaps, closed together.

**Field-level RBAC**: `custom_field_definitions` gains an additive
`restricted_to_permission` column (migration
`025_field_level_rbac.sql`, null = unrestricted, the default). New
`fields.view_restricted` permission in the custom-role catalog. Pure
`filterRestrictedFields(customFields, definitions, caller)` (5 new
tests) strips a restricted field's VALUE — never its existence in the
catalog — from a ticket read when the caller lacks the permission and
isn't owner/admin. Wired into `TicketsService.get()` via an OPTIONAL
new `caller` param — every other existing call site (service-to-
service reads) is unaffected; only `GET /tickets/:id` threads it
through. Disclosed scope: only the single-ticket read is covered this
pass, not list/board/query endpoints. `apps/web`: a "Restrict
visibility" checkbox + a "Restricted" badge on the custom-fields admin
page.

**Branch-level RBAC beyond CODEOWNERS**: a new `branch_push_allowlist`
table (git-host's schema string) — an explicit per-branch-pattern
MERGE allowlist, distinct from `branch_protection_rules`' review-count
requirement. Fail-open when unconfigured, same discipline as
`tenant_ip_allowlist`. Pure `isUserAllowedAmong` — git-host's SECOND
Go test package (`allowlist_test.go`, 6 cases), after `internal/
devpanel`'s being the first. Enforced in `pullrequests.Merge` via a
new `callerUserID` param threaded from `claims.Sub`. `POST/GET /api/
repos/{repo}/branch-allowlist`, `DELETE /api/branch-allowlist/{id}`.
Disclosed scope: merge-time enforcement only, not direct-push
interception (git-host doesn't intercept raw git wire-protocol pushes
today — same limitation `branch_protection_rules` already has).
`apps/web`: a "Merge allowlist" section on the repo settings page.

**Budget/financial-data visibility RBAC**: `services/bi`'s cost-
report/rate-card endpoints were `JwtAuthGuard`-only before this pass —
any authenticated tenant member could read them. Now gated behind
`budget.view`/`budget.edit` (already existed in the custom-role
catalog, previously unenforced anywhere) via a ported `Permissions
Guard`/`@RequiresPermission` (bi's first role/permission check of any
kind, bi's second adopter of the custom-role pattern after pm's
board-layout integration). A ticket's own status stays fully visible
via pm's ordinary read, untouched — only the cost/rate data is gated.
This is a genuine, deliberate behavior change for any existing non-
owner/admin caller without the permission — disclosed as intended, not
a regression.

**Verification status**: `tsc --noEmit`/`nest build` clean on pm/bi,
`go build`/`go vet`/`go test` clean on git-host, `next build` clean;
pm's Jest suite (46 tests, up from 41) and bi's (8 tests) both pass;
not yet curl-verified against real ticket/repo/budget data (no
running Postgres this pass).

## 2026-08-13 — Geo-based access restriction + impossible-travel anomaly detection (§11.1)

`tenants.geo_allowed_countries text[]` + `users.last_login_country`/
`last_login_at` (migration `012_geo_restrictions.sql`). New
`GeoIpService.resolveCountry(ip)` — a real, wired async interface with
an honestly-disclosed STUB implementation: no MaxMind GeoLite2/GeoIP2
database ships in this repo (no license key available to provision
one), so the lookup table covers only IANA's three documentation IP
ranges — enough to unit-test the enforcement logic, not a working
resolver for real traffic. Swapping in a real provider is a single
method-body change.

Enforced in `AuthService.login()` alongside the existing IP-allowlist
check (before the user lookup). Pure `isCountryAllowed` (4 tests,
fail-open on unrestricted/unresolvable). `GET/POST /tenants/geo-
restrictions` (read: any user; write: owner only). `apps/web`: a
country-code field on the Network access settings page.

**Impossible-travel**: pure `isImpossibleTravel(previous, current,
thresholdMinutes=120)` (5 tests) compares a login's country against
the user's last one. Deliberately a SOFT signal — flagged and audit-
logged (`user.login.anomaly_impossible_travel`) but never blocks,
since a VPN switch or carrier IP reassignment triggers the same signal
a real takeover would. Country-level only (no geocoordinates in this
build's stub), and only checked on the direct password-login path —
the MFA/WebAuthn verify flows don't yet re-check it, disclosed
narrower scope. `UsersService.updateLastLogin()` stamps the baseline
only after a genuinely successful login, never a rejected one.

**Verification status**: `tsc --noEmit`/`nest build` clean, auth's
Jest suite (40 tests, up from 31) passes, `next build` clean; not yet
curl-verified against a real login round trip (no running Postgres
this pass, and no real GeoIP data to verify against regardless).

## 2026-08-13 — Device fingerprinting + "new device" login challenge (§11.1)

"Fingerprinting" is a persistent client-generated device id
(`crypto.randomUUID()`, stored in `localStorage`, sent on every
login) — not passive browser fingerprinting. New `known_devices`
(SHA-256 hash of the id, never the raw id) and `device_challenges`
tables (migration `013_device_fingerprinting.sql`), same "opaque
server-side challenge, not a JWT" shape as the existing MFA
login-challenge.

Opt-in, owner-configurable (`tenants.device_challenge_required`,
default false) — same "off by default" stance as `mfa_required`, to
avoid a breaking UX change sprung on every existing tenant with no
opt-out. Skipped when the user already has MFA enabled. A missing
device id is treated as unknown, so the check can't be bypassed by
omitting it.

`DevicesService.createChallenge` emails a 6-digit code via
`services/notifications`'s `EmailService` (same internal-endpoint
pattern pm's saved-query subscriptions established) — a failed send
fails closed. `POST /auth/device/verify` (mirrors `/auth/mfa/
login-verify`); `GET/DELETE /auth/devices` (self-service list/
forget); `GET/POST /tenants/device-challenge-required` (owner-only
write).

`apps/web`: the login page gained a device-code entry form; security
settings gained the toggle plus a recognized-devices list with
per-device "Forget."

**Verification status**: `tsc --noEmit`/`nest build` clean, auth's
Jest suite (40 tests) unaffected, `next build` clean; not yet
curl-verified against a real challenge/email round trip (no running
Postgres this pass, no real SMTP configured regardless).

## 2026-08-13 — SIEM export delivery worker (§11.1)

The config surface (`services/compliance`'s `siem-exports`) was
manual-trigger-only; this gives it an actual scheduled worker, reusing
§13.3's scheduler infra (`services/notifications`'s `SchedulerService`)
rather than reinventing one.

New `SiemExportService.runDue()`: cross-tenant listing via a
`SECURITY DEFINER` function (`list_enabled_siem_exports()`, migration
`004_siem_export_worker.sql`, same pattern as pm's
`list_due_subscriptions()`), then each row's export runs through a
normal `withTenant(tenantId, ...)` connection, sharing the same
delivery/stamp logic (`deliverAndStamp`) the manual trigger already
used.

`services/auth` gained `GET /audit-log/internal` (`x-internal-secret`-
gated, explicit `tenantId` query param) since a cron tick has no
end-user JWT to borrow — the manual `triggerExportNow` path is
unchanged, still using the caller's own authorization header.
`POST /siem-exports/internal/run-due` is the scheduler's entry point;
`SchedulerService` gained a second `@Cron(EVERY_HOUR)` job — exactly
the fast-follow that service's docblock flagged when it first shipped.

**Verification status**: `tsc --noEmit`/`nest build` clean on auth/
compliance/notifications, all three services' existing Jest suites
unaffected; this cron job has never actually ticked against running
compliance/auth services — no Docker this pass.

## 2026-08-13 — BYOK + secrets management (Vault/KMS) via a new shared @nexus/kms package (§11.1)

New `packages/kms` (`@nexus/kms`) — this repo's first cross-service
shared crypto package, same `file:../../packages/X` workspace pattern
as `@nexus/rate-limiter`. Two real pieces:

**Platform-managed envelope encryption**: genuine AES-256-GCM (Node's
own `crypto`), `encryptSecret`/`decryptSecret`, random IV per call,
GCM's auth tag catching tampering/wrong-key attempts. 11 tests.
Applied to both plaintext-at-rest secret columns this build had
flagged: `services/identity-federation`'s OIDC client secret
(encrypted on write, decrypted only right before the token-exchange
call) and `services/compliance`'s SIEM export auth token (same shape,
shared by both `triggerExportNow` and the new `runDue()` worker).

**BYOK config surface**: `tenant_kms_keys` (migration `014_byok.sql`),
`GET/POST /tenants/kms-key` (owner-only write), fixed provider
vocabulary, `isPlausibleKeyReference` (regex-shape-validated per
provider) checked before accepting a key reference. 6 more tests (17
total in the package).

**Disclosed, not overclaimed**: the actual AWS/Azure/GCP KMS API calls
a real BYOK integration needs are NOT implemented — no cloud
credentials available in this environment. `StubExternalKmsResolver`
fails CLOSED with a named error rather than silently falling back to
the platform key.

`apps/web`: an "Encryption key management (BYOK)" section on the
security settings page.

**Verification status**: `tsc`/`nest build` clean on @nexus/kms/auth/
identity-federation/compliance; every touched service's pre-existing
Jest suite unaffected (auth 40, compliance 5, pm 46, bi 8, onboarding
3, incident-management 3); @nexus/kms's own 17 tests pass; `next build`
clean; not yet curl-verified against a real login/export round trip
with real encrypted data (no running Postgres this pass).

## 2026-08-13 — WebRTC video/audio calls + recording + call-from-ticket paging (§11.6)

Closes all three §11.6 gap items together. Architecture, deliberately
NOT LiveKit/Mediasoup: a MESH topology — every participant's browser
connects directly to every other via a real `RTCPeerConnection`; the
server only relays signaling (SDP offer/answer + ICE candidates),
reusing the SAME authenticated Socket.IO gateway chat already runs
(`chat.gateway.ts` gained `call:join`/`call:leave`/`call:signal`, a
fixed "existing member offers to newcomer" convention avoiding a
simultaneous-offer race).

New `calls`/`call_participants`/`call_recordings` tables (migration
`003_calls.sql`, `services/comms`), `CallsService`, `POST/GET /calls`.

**Real bug fixed live in code review**: Socket.IO's `'disconnect'`
fires AFTER rooms are emptied — a vanished peer (closed tab, lost
network) would never tell remaining peers to tear down their
connection. Fixed by hooking the earlier `'disconnecting'` event,
where `socket.rooms` is still populated.

Frontend: `use-webrtc-call.ts` — real, functional `getUserMedia`/
`RTCPeerConnection`/ICE-exchange logic, not a stub — plus a
`CallPanel` component (video grid, mute/camera/screen-share/hang-up).
"Start call" buttons on the channel page and ticket detail page.

**Recording**: client-side `MediaRecorder`, uploaded to
`call_recordings` + local-disk storage (same pattern as
`services/artifacts`'s package storage, 5 new tests mirroring that
file's suite). Disclosed scope: records only the local participant's
own feed, not a mixed recording of every peer (needs a canvas + Web
Audio compositing pipeline this pass doesn't build).

**Call-from-ticket paging**: `pageForCall` reuses `services/
notifications`'s push-send endpoint, carrying the callId so the
client can deep-link into joining. Pages the ticket's current
assignee — narrower than a full on-call escalation chain (incident-
management's domain), disclosed as such.

**Verification status**: `tsc --noEmit`/`nest build` clean, comms'
Jest suite (12 tests, up from 7) passes, `next build` clean; the
actual browser WebRTC flow has never been tested against real running
services or two real browsers — no Docker this pass, and this is the
least-verified item this session (needs two real browser sessions to
exercise meaningfully).

## 2026-08-13 — GraphQL API gateway (§11.9)

New `services/graphql-gateway` (port 4018, NestJS + `@nestjs/graphql`/
Apollo, code-first) — the platform's first GraphQL surface. Honestly a
GATEWAY pattern, not true Apollo Federation (disclosed in both the
service's README and FEATURES.md): real federation means all 17
services defining subgraph schemas, a change to every service, not
one new one.

Resolvers compose pm's projects/tickets and auth's tenant users into
one schema, with real composed field resolvers (`Ticket.project`,
`Ticket.assignee`) — one round trip instead of a client orchestrating
three REST calls itself. Every resolver forwards the CALLER's own
bearer token downstream (`rest-client.ts`) — no gateway-held
credential, no new trust boundary.

REST payloads (snake_case) are explicitly mapped to camelCase
GraphQL types rather than relying on same-name property resolution
(6 unit tests covering the mapping, numeric coercion, null
preservation).

**Real gap closed as a side effect**: pm had no single-project
`GET /projects/:id` at all — added for real, needed by the `project`
field resolver.

**Disclosed scope**: no DataLoader batching — a real N+1 pattern per
list query, acceptable at this pass's volume, a genuine fast-follow
before this becomes a primary read path.

**Verification status**: `tsc --noEmit`/`nest build` clean on
graphql-gateway and pm; graphql-gateway's own Jest suite (5 tests)
passes, pm's existing suite (46 tests) unaffected; the actual query
execution has never been curl/Playground-verified against real
running services — no Docker this pass.

## 2026-08-13 — DR backup/restore automation, wired to the policy registry (§11.1/§0)

The DR policy registry always tracked RPO/RTO targets and
`last_verified_restore_at` as DATA; nothing ever took a real backup or
attempted a real restore. Closed for `tickets`, end to end, real.

Real, row-level, tenant-scoped export — deliberately not `pg_dump`
(wrong granularity for a shared multi-tenant table where RLS is what
separates tenants): pm's `BackupService.exportTickets`. Real restore
verification, not a manual timestamp stamp: `verifyRestore` creates a
uniquely-named `ON COMMIT DROP` staging table `LIKE tickets INCLUDING
ALL`, inserts every row, counts them, lets Postgres drop it — proving
the backup is genuinely restorable without ever touching live data.

compliance's new `DrBackupService` orchestrates: calls pm to export,
writes the blob to local disk (`dr-backup/storage.ts`, same pattern as
artifacts'/comms' storage.ts, 5 tests), records a real `backup_runs`
row; `verifyLatestTicketsRestore` reads the blob back, calls pm's
verify endpoint, records `restore_verifications`, and updates
`last_verified_restore_at` ONLY on genuine success.

Scheduled, not just manual: `SchedulerService` gained a THIRD `@Cron`
job (`runDrBackups`, daily), cross-tenant listing via a `SECURITY
DEFINER` function — this scheduler's third consumer, exactly the
fast-follow pattern its docblock flagged twice already.

`apps/web`: the Data Retention page gained "Take backup now"/"Verify
latest restore" buttons + history, and a stale "no scheduler exists"
string (predating §13.3) got fixed in the same pass.

**Honest scope**: only `tickets` is wired up — the other 4 data
classes need their owning services to grow the same export/verify
pair, same "one real, rest disclosed" scope as retention purge.

**Verification status**: `tsc --noEmit`/`nest build` clean on pm/
compliance/notifications; pm's Jest suite (46 tests) and compliance's
(10 tests, up from 5) unaffected/passing; `next build` clean; the
actual export→disk→restore-verify round trip has never run against
real services — no Docker this pass.

## 2026-08-13 — Platform-own secrets management + blue/green self-deploy (§11.10)

Two related "the platform operating itself" gaps, closed together —
both genuinely distinct from tenant-facing equivalents already built
this session (BYOK, product canary/blue-green).

**Secrets management**: new `packages/secrets` (`@nexus/secrets`),
sibling to `@nexus/kms`. Real `SecretsProvider` interface —
`EnvSecretsProvider` (real, stays the default) plus `Vault`/`AwsSecrets
Manager` providers that fail CLOSED with a named error rather than
silently falling back to an env var (no real cloud credentials in this
environment). `resolveSecretsProvider(env)` reads `SECRETS_PROVIDER`
as the one flip point a real deployment would use. 10 tests. Applied
for real: `services/auth`'s `KeyManagementService` (the JWT signing
keypair) now reads its two env vars through
`EnvSecretsProvider.getSecretSync` instead of raw `process.env` — a
disclosed sync-only limitation (that constructor runs before Nest's
async lifecycle hooks are available). DB passwords remain
connection-string env vars, tracked as the natural next call site.

**Blue/green self-deploy**: new `packages/deploy-orchestrator`
(`nexus-deploy` CLI, same `packages/cli` precedent). Real pure planning
logic (`nextColor`/`portFor`/`decideHealthCheckOutcome`/`planDeploy`,
13 tests) — blue keeps a service's normal port, green gets `+1000` so
both run simultaneously. The side-effecting half genuinely spawns the
new version as a separate process and polls its real `/health`
endpoint until it proves itself N times in a row or times out — on
failure the old instance is never touched. Disclosed scope: does not
shift real traffic at a load balancer (this repo has none for its own
services); the job ends at a genuine "ready for cutover" signal.

**Verification status**: `tsc -p`/build clean on both packages and
auth; @nexus/secrets (10 tests) and @nexus/deploy-orchestrator (13 tests)
both pass; auth's existing suite (40 tests) unaffected; the actual
spawn-and-health-check path has never run against a real service this
session — no Docker/live services this pass.

## 2026-08-13 — Time-based automation triggers + extended guest enforcement (§13.3, §12.7 fast-follows)

**Time-based automation triggers**: `services/pm`'s automation engine
gains a `stale_unassigned` trigger type (`{ hours: N }`), firing on the
passage of time rather than a ticket write — the exact fast-follow
flagged as blocked back when the automation engine and scheduler infra
first shipped. New `list_tenants_with_stale_unassigned_automations()`
`SECURITY DEFINER` function (migration `026`) gives the scheduler the
cross-tenant tenant list a normal RLS-scoped connection can't see;
`AutomationsService.runDueTimeBasedTriggers()` re-enters each tenant via
`withTenant(...)` to scan for unassigned tickets past their threshold,
deduped against `automation_runs` so a ticket fires once per automation,
not once per hourly tick. New `POST /internal/automations/run-due` (its
own internal-only controller, kept off the class-level JWT guard) is now
`services/notifications`'s fourth `@Cron` job. Deliberately not nested
inside one `withTenant()` call for the scan+fire, avoiding the
already-diagnosed nested-`withTenant` bug class. 6 new unit tests.

**Extended guest enforcement**: `ProjectGuestGuard` (§12.7) generalized
via a new `@GuestProjectLookup(table)` decorator — a fixed 3-value
vocabulary (`tickets`/`wiki_pages`/`releases`) telling the guard which
table to resolve a `:id` route param's project against; omitting it
keeps the original `tickets` default, so `TicketsController` needed no
changes. Now also applied to `BoardsController.get`, and
`WikiController`/`ReleasesController`'s `:id`-keyed routes. Still
explicitly not covered: wiki/release `create()` (body-only projectId,
same gap `TicketsController.create()` already discloses),
`ReleasesController.tagTicket` (`:ticketId`, not `:id`), and pm's
remaining ~18 other modules — tracked in `docs/FEATURES.md`, not
silently implied as closed.

**Verification status**: `tsc --noEmit`/`nest build` clean on pm and
notifications; pm's Jest suite (56 tests, up from 50) passes. Not
live-curl-verified — no running Postgres/services this pass.

## 2026-08-14 — Test-coverage fast-follow: notifications, identity-federation, data-warehouse-sync, git-host/codeowners

Closes the "remaining without any test suite" gap flagged in §11.10's
original automated-tests entry. All three Node services genuinely had
thin pure-function surface (that original assessment was correct) — so
this pass first EXTRACTED real decision logic out of DB/network-coupled
methods, same discipline as the original 13-service test rollout,
rather than mocking pg/fetch/webpush to fake coverage:

- **notifications**: `decidePushDeliveryStatus` (sent/failed/
  no_subscription), pulled out of `PushService.sendToUser`. 4 tests.
- **identity-federation**: `mapSamlAttributesToIdentity`/
  `resolveEffectiveAssertionId` (IdP attribute-casing fallbacks +
  assertion-id reconstruction), pulled out of `SamlSpService.processAcs`;
  `isOidcLoginStateExpired`. 12 tests. **Real bug caught while
  extracting**: `OidcLoginService`'s in-memory pending-login-state map
  never expired an abandoned state — fixed with a 10-minute TTL check on
  use plus opportunistic pruning on every new login attempt.
- **data-warehouse-sync**: `isUnsupportedWarehouseConnector`/
  `buildExportFileName`, pulled out of `ExportsService.writeToDestination`.
  4 tests.

All three services now have a `jest.config.js` + `"test": "jest"` script
for the first time — previously absent entirely, not configured-but-empty.
20 new tests total, all passing. 16 of 17 Node services now have a
unit-test tier.

**git-host**: added `internal/codeowners/codeowners_test.go` (7 cases) —
`Parse`'s comment/blank-line/leading-slash handling and `OwnersFor`'s
last-match-wins/dedup/no-match/union semantics. git-host's test tier
grows from 2 to 3 of 9 internal packages; the remaining 6 are mostly
thin `exec.Command`/HTTP-handler wrappers with little pure logic to
extract without a live git repo to shell out against — an open,
disclosed follow-up.

**Verification status**: `tsc --noEmit`/`nest build` clean on all three
Node services; `go build ./...`/`go vet ./...`/`go test ./...` clean on
git-host. Not live-curl-verified — no running Postgres/services this
pass (same disclosed bar as everything else this session).

## 2026-08-14 — Cross-project capacity rollup (§12.9)

Revisited the "no well-defined current sprint" objection this item was
originally deferred on — `sprints.idx_sprints_one_active_per_project`
already enforces at most one active sprint per project at the DB layer,
so the concept was already unambiguous. New
`TeamPlannerService.portfolioCapacityRollup(tenantId)`: one join to find
every project's active sprint (or null, listed not dropped), two batched
aggregate queries for capacity/allocated totals — same per-sprint math
`getPlan()` already does, just summed across projects so it can't drift.
New `GET /team-planner/portfolio-capacity`. `/portfolio` page gained a
capacity section next to the existing budget rollup.

`tsc --noEmit`/`nest build` clean on pm, `next build` clean on apps/web,
pm's Jest suite (56 tests) unaffected. Not live-curl-verified — no
running Postgres this pass.

## 2026-08-14 — Per-user/per-project notification preferences (§12.6)

New `notification_preferences` table (`services/notifications`,
migration `003`) — opt-out model, a project-specific row overrides a
user's global default for a category, no row means enabled. Fixed
`NOTIFICATION_CATEGORIES` vocabulary + `ALWAYS_DELIVERED_CATEGORIES`
(incident_page/new_device_challenge can never be muted) with a pure
`resolveNotificationEnabled` precedence function. Wired into
`PushService.sendToUser` — a muted category short-circuits to a
`'muted'` delivery record, still visible in the inbox, never silently
dropped. `AutomationsService`/`ApprovalsService` now thread their
ticket's `project_id` through; comms' @mention path and pm's
query_subscription digest (email-only today) are disclosed as not yet
covered. New `/notifications/preferences` page.

`tsc --noEmit`/`nest build` clean on notifications/pm/comms, `next
build` clean; notifications' Jest suite 12/12 (up from 4). Not
live-curl-verified — no running Postgres this pass.

## 2026-08-14 — Digest emails (§12.6)

New `user_digest_settings` table (opt-in, default 'off') + a
`list_users_due_for_digest()` SECURITY DEFINER cross-tenant lookup. Pure
`buildDigestEmail`/`shouldSendDigest` (no email for zero new deliveries),
8 tests. `DigestService.runDue()` is the one scheduled job called
directly in-process rather than over an internal HTTP hop, since digest
settings and `notification_deliveries` both already live in
services/notifications — a fifth `@Cron` job, daily at 8am, that itself
decides per user whether daily/weekly is actually due. New
`GET/POST /digest-settings`; preferences page gained a frequency
selector.

`tsc --noEmit`/`nest build` clean on notifications, `next build` clean;
notifications' Jest suite 19/19 (up from 12). Not live-curl-verified —
no running Postgres this pass.

## 2026-08-14 — Configuration Schemes closed: Notification Schemes (new) + Field-Configuration Schemes (corrected stale note) (§13.8)

**Notification Schemes**: new `services/pm` `notification_scheme_rules`
table — a per-PROJECT admin default mapping `event_type` (ticket_created/
status_changed/assigned) to `notify_roles` (assignee/watchers — no
reporter role, tickets has no reporter column, disclosed). Falls back to
`DEFAULT_NOTIFICATION_SCHEME` when unconfigured; an explicit empty array
means deliberately off. Pure `resolveSchemeRecipients`, 10 tests. Wired
into `TicketsService.create()`/`transition()`/`assign()` as fire-and-
forget, alongside (not instead of) the automation engine — matches
Jira's own behavior where a scheme and an automation rule can both fire.
Sends through the same PushService choke point, so per-user preference
muting applies (`notification_scheme` added to NOTIFICATION_CATEGORIES).
New `GET /notification-schemes/:projectId`, `POST /notification-schemes`
(boards.manage-gated); new project settings page.

**Field-Configuration Schemes**: on inspection, already substantively
shipped as §11.2's typed custom fields + per-screen layouts
(`custom_field_definitions`/`custom_field_screens`) — the "still-open"
note was stale. No new mechanism built; cross-reference corrected.

`tsc --noEmit`/`nest build` clean on pm/notifications, `next build`
clean; pm's Jest suite 66/66 (up from 56), notifications' 19/19. Not
live-curl-verified — no running Postgres this pass.

## 2026-08-14 — Centralized structured logging + OpenTelemetry tracing across all 17 Node services (§11.10)

New `packages/tracing` (`@nexus/tracing`): `initTracing(serviceName)` — a
real NodeSDK with auto-instrumentation (HTTP server + client, so
traceparent context propagates across every internal fetch/http call
this build already makes, no manual header-threading needed) and
`createLogger(serviceName)` — structured JSON logs auto-stamped with the
active span's real trace/span id. `buildLogRecord`/`formatLogLine` pure
and tested, 5 tests. Dev-safe fallback: with no
OTEL_EXPORTER_OTLP_ENDPOINT set, the SDK still runs for real and
generates real trace/span ids for log correlation, just doesn't export
anywhere yet.

Rolled out mechanically (scripted, not by hand) to all 17 Node services'
main.ts as the literal first statement, before reflect-metadata/@nestjs
imports (ordering is load-bearing — CommonJS require() runs in source
order, and auto-instrumentation must patch HTTP modules before anything
else imports them).

Verified: tsc --noEmit, nest build, and each service's full jest suite
run clean across all 17 services post-rollout — zero regressions, every
existing test count unchanged. Out of scope: git-host (Go, separate
SDK), metrics/logs OTLP export (traces only), and an actual running
collector (no Docker this pass — real trace/span ids generated and
logged locally, never yet shipped to a real backend).

## 2026-08-14 — Formal API versioning strategy (§11.10)

All 17 Node services now call NestJS's real URI versioning
(`VersioningType.URI`, `defaultVersion: VERSION_NEUTRAL`) — mechanically
rolled out to every main.ts. VERSION_NEUTRAL default means every
existing route keeps its bare path forever; only an explicitly
`@Version('1')`-decorated handler moves under `/v1/...`. Real
demonstration: `services/pm`'s new `GET /v1/version-info`, reachable
only at the versioned path. Full strategy documented in new
`docs/API_VERSIONING.md` — future breaking changes add a new versioned
handler alongside the legacy VERSION_NEUTRAL one rather than mutating it.

Verified: tsc --noEmit/nest build/jest clean across all 17 services,
identical test counts to before the change (zero regressions, zero
route paths broken). Disclosed gaps: no deprecation/sunset signaling, no
consumer version-usage analytics, GraphQL schema evolution untouched.
Not curl-verified — no running services this pass.

## 2026-08-14 — Horizontal scaling checklist (§11.10) + git-host test coverage (browse, repos, secretscan)

New `docs/HORIZONTAL_SCALING.md` — a real codebase sweep (not written
from memory) consolidating every local-disk write, in-memory Map, and
process-local external-call dependency that would break under 2+
replicas: 5 services' local-disk writes (2 not previously flagged
anywhere: compliance's data-export bundles, data-warehouse-sync's
exports), identity-federation's OIDC pending-state map, cicd's job-broker
+ pending-approvals maps (with a structural note that a pipeline run is
pinned to its originating replica until all three related pieces move
together), and git-host's local-filesystem repo storage (never
previously documented as a swap-in candidate). **New gap discovered
while compiling this doc**: comms' WebRTC call-signaling relay reads
Socket.IO's local in-memory adapter directly and has no
@socket.io/redis-adapter wired — unlike chat messages (already safe via
Redis pub/sub), two call participants on different replicas would
silently fail to signal each other. Documentation-only deliverable, no
code changed.

git-host: added internal/secretscan/secretscan_test.go (9 cases),
internal/repos/repos_test.go (3 cases, ValidName's path-traversal
rejection), internal/browse/browse_test.go (4 cases, isHexPrefix). Test
tier now 6 of 9 packages (up from 3 at session start); auth/db/gitcgi
remain genuinely thin wrappers with little pure logic, pullrequests has
one small unextracted nugget — disclosed remainder.

go build/vet/test clean across all packages.

## 2026-08-14 — Fix WebRTC cross-replica signaling; OTel metrics+logs export; close remaining git-host test-coverage gap

**WebRTC signaling fix**: new `services/comms/src/redis-io.adapter.ts`'s
`RedisIoAdapter` (wraps `@socket.io/redis-adapter` over two `ioredis`
connections), wired into `main.ts` via `app.useWebSocketAdapter(...)`.
Fixes the real, previously-undocumented gap found while writing
docs/HORIZONTAL_SCALING.md: the WebRTC call-signaling relay
(`handleCallJoin`/`handleCallSignal`) read Socket.IO's local in-memory
adapter directly, so two call participants on different replicas would
silently fail to signal each other. Chat messages were already safe
(hand-rolled Redis pub/sub bridge); that bridge is left in place,
now functionally redundant but not removed this pass. `tsc --noEmit`/
`nest build` clean, comms' Jest suite 12/12 unaffected. Not
live-verified against two real replicas — no Docker this pass.

**OTel metrics + logs export**: `@nexus/tracing`'s `initTracing` now also
wires a real `PeriodicExportingMetricReader` and a real `LoggerProvider`
(registered globally via `@opentelemetry/api-logs`) alongside the
existing trace SDK — `createLogger` emits every log line as a genuine
OTel log record (correlated to the active trace/span id) in addition to
stdout. Same dev-safe-fallback discipline as traces: real SDKs, real
generated data, nothing exported without `OTEL_EXPORTER_OTLP_ENDPOINT`
set. New `severityNumberFor` pure mapping, 2 more tests (7 total in the
package). Re-verified clean across all 17 Node services after the
dependency bump — identical test counts, zero regressions.

**git-host test coverage — now 9 of 9 internal packages**: added
`internal/db/db_test.go` (new `isValidTenantID`, the SQL-injection guard
pulled out of `WithTenant`), `internal/gitcgi/handler_test.go` (the
already-pure `PathInfo`), `internal/auth/jwt_test.go` (new
`bearerToken`, pulled out of `FromRequest`), and
`internal/pullrequests/mergestrategy_test.go` (new
`normalizeMergeStrategy`, pulled out of `Merge`). `auth`'s real
JWKS-fetch-and-verify path, `db`'s real Postgres path, and `gitcgi`'s
real CGI-subprocess relay remain untestable without live network/DB/git
infra — the same honest boundary every other pure-logic-extraction in
this build draws.

`go build ./...`/`go vet ./...`/`go test ./...` clean across all 9
packages.

## 2026-08-14 — Project renamed: Enterprise OS → Nexus

Full rename, not just a directory move:

- Root directory `enterprise-os/` → `nexus/`; root `package.json`'s
  `"name"` → `"nexus"`.
- Every internal npm package's scope, `@eos/*` → `@nexus/*` — package
  `name` fields, every `dependencies` entry, every `import ... from
  '@eos/...'` across all 17 services + `apps/web` + every shared
  `packages/*` (53 files, scripted, not by hand).
- `git-host`'s Go module path, `github.com/eos/git-host` →
  `github.com/nexus/git-host`, and every internal import referencing it
  (8 files).
- Product branding text: doc titles (`docs/FEATURES.md`,
  `docs/ARCHITECTURE.md`, `docs/CHANGELOG.md`, `docs/ROADMAP.md`), the
  web app's `<title>`/metadata, WebAuthn/TOTP relying-party name, the
  webhook signature header (`x-eos-signature` → `x-nexus-signature`),
  and every other product-visible or project-identifying string (CLI
  bin names `eos`/`eos-deploy` → `nexus`/`nexus-deploy`, localStorage
  keys, temp-directory/default-storage-path prefixes).
- **Deliberately NOT renamed**: Postgres role/database naming
  (`eos_app` role, `eos_<service>` database names, connection-string
  defaults across every `db/pool.ts`/`migrate.ts` and git-host's
  `db.go`) — infra-level convention, out of scope for a project-name
  rename and materially higher-risk to change with no Docker to
  live-verify a role/database rename against.

**Verification**: full `tsc --noEmit`/`nest build`/`jest` pass across
all 17 Node services, all 6 shared `packages/*`, and `apps/web`, plus
`go build`/`go vet`/`go test` across all 9 `git-host` packages — all
clean, every test count identical to before the rename (zero
regressions). `pnpm install` re-resolved the entire workspace against
the renamed package names with no errors.
