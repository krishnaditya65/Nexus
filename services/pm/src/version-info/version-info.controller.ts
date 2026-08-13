import { Controller, Get } from '@nestjs/common';

/**
 * Real, working demonstration of the platform's API versioning strategy
 * (docs/API_VERSIONING.md, docs/FEATURES.md §11.10) — the only route in
 * this service (deliberately) registered under an explicit version
 * rather than the global `VERSION_NEUTRAL` default every other route
 * still uses. Reachable at `GET /v1/version-info`, NOT `GET
 * /version-info` (bare) — proving the URI-prefixed path genuinely works
 * end to end, not just that `enableVersioning` was called in `main.ts`.
 */
@Controller({ path: 'version-info', version: '1' })
export class VersionInfoController {
  @Get()
  get() {
    return {
      service: 'pm',
      apiVersion: '1',
      note: 'Most routes on this service are VERSION_NEUTRAL (unversioned, e.g. GET /tickets) — this endpoint is the one deliberate example of an explicitly versioned route, reachable only at /v1/version-info.',
    };
  }
}
