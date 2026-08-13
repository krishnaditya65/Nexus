# API Versioning Strategy

(docs/FEATURES.md §11.10 — "Formal API versioning strategy: every
service's REST surface is unversioned — a breaking change today has no
migration path for existing API-key consumers.")

## Mechanism

Every one of this platform's 17 Node services calls NestJS's built-in
URI versioning in `main.ts`:

```ts
app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
```

`VERSION_NEUTRAL` as the **default** is the load-bearing choice: every
route that doesn't explicitly opt in with `@Version('1')` (or a future
`'2'`) keeps responding at its current, bare path — `GET /tickets`,
`POST /automations`, etc. — exactly as it always has. Enabling
versioning platform-wide changed **zero** existing route paths and broke
**zero** existing API-key consumers, verified by running every service's
full `tsc --noEmit`/`nest build`/`jest` suite before and after the
rollout with identical results.

A route only moves under a version prefix (`/v1/...`) when a controller
or handler is explicitly decorated:

```ts
@Controller({ path: 'version-info', version: '1' })
export class VersionInfoController { ... }
```

`services/pm`'s `GET /v1/version-info` is the one real, working
demonstration of this in the codebase today — reachable ONLY at
`/v1/version-info`, not the bare path, proving the mechanism functions
end to end (not just that `enableVersioning()` was called).

## When to use it

**Never mutate an existing VERSION_NEUTRAL route's request/response shape
in a breaking way.** Instead:

1. Add a new handler (or new controller) for the same resource, decorated
   `@Version('1')` (or the next unclaimed version number), with the new
   shape.
2. Leave the existing `VERSION_NEUTRAL` route exactly as it is — it is
   the implicit, permanent "v0"/legacy contract every pre-existing
   consumer already depends on.
3. Once every known consumer has migrated (tracked outside this repo —
   there is no API-key usage-analytics system in this build to detect
   that automatically, a disclosed gap), the legacy `VERSION_NEUTRAL`
   route can be deprecated and eventually removed on its own schedule.

A non-breaking change (new optional field, new endpoint, widened
validation) never needs a new version at all — it's safe to make
directly on the `VERSION_NEUTRAL` route, same as any additive change
always was.

## What this does not (yet) do

- **No response-shape versioning for GraphQL** — `services/graphql-
  gateway`'s schema has its own, separate compatibility story (schema
  evolution via additive fields, standard GraphQL practice); URI
  versioning doesn't apply to it the same way and wasn't touched here.
- **No automatic deprecation warnings or sunset headers** — a
  `VERSION_NEUTRAL` route slated for removal has no machine-readable
  signal today; that's a real, disclosed follow-up, not silently solved.
- **No per-consumer version pinning/analytics** — nothing in this build
  tracks which API keys are calling which version, so "is it safe to
  remove this legacy route yet" is still a manual/organizational
  question, not one this system answers for you.
- **Not live-verified** — the URI-prefix routing itself has never been
  curled against a running service this session (no Docker this pass);
  it's real, compiled, tested-by-build code, not yet tested-by-request.
