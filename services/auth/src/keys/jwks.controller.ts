// Publishes this service's RSA public signing key(s) as a standard JWKS
// (RFC 7517) document. Deliberately unauthenticated and outside any tenant
// context — every other service's JwtStrategy fetches this at startup (and
// on cache expiry) to verify tokens without ever holding a secret. Mirrors
// the SECURITY DEFINER pattern used for other pre-auth lookups in this
// codebase (SCIM token resolution, API key resolution): the thing being
// exposed is intentionally public, so it lives outside the authenticated,
// tenant-scoped request path rather than being awkwardly bolted onto it.
import { Controller, Get } from '@nestjs/common';
import { KeyManagementService, RsaPublicJwk } from './key-management.service';

@Controller('.well-known')
export class JwksController {
  constructor(private readonly keys: KeyManagementService) {}

  @Get('jwks.json')
  getJwks(): { keys: RsaPublicJwk[] } {
    // Single active key today. Rotation (publishing the outgoing key
    // alongside the new one for its remaining token lifetime, then dropping
    // it) is a documented future extension of this array — every JWKS
    // consumer already keys off `kid`, so adding entries here is additive
    // and requires no change on the verify-only side.
    return { keys: [this.keys.getPublicJwk()] };
  }
}
