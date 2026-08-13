// §11.9's honest gap, closed for this service: `services/api-platform`'s
// ApiKeyGuard existed but wasn't wired into any other service's routes,
// so an issued `nexus_live_...` API key couldn't actually authenticate a
// request anywhere. This guard accepts EITHER a real user session JWT
// (delegates to the existing JwtAuthGuard/passport 'jwt' strategy) OR an
// API key (resolved live against api-platform's internal endpoint,
// same cross-service pattern as every other internal call in this
// platform) — whichever the Authorization header actually carries.
//
// An API-key-authenticated request gets a synthetic req.user with no real
// `sub` (an API key isn't a specific human) and `role: 'api-key'` — every
// route already reading req.user.tenant_id keeps working unchanged;
// routes that specifically need a human actor (e.g. audit's actorUserId)
// will record `null`, which is correct, not a bug: an API-key-driven
// action genuinely has no human behind it in the moment of the call.
import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtAuthGuard } from './jwt-auth.guard';

const API_KEY_PREFIX = 'nexus_live_';

@Injectable()
export class TenantAuthGuard implements CanActivate {
  constructor(private readonly jwtGuard: JwtAuthGuard) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const header: string | undefined = req.headers['authorization'];

    if (header?.startsWith(`Bearer ${API_KEY_PREFIX}`)) {
      const rawKey = header.slice('Bearer '.length);
      const apiPlatformUrl = process.env.API_PLATFORM_SERVICE_URL ?? 'http://localhost:4013';
      const res = await fetch(`${apiPlatformUrl}/internal/api-keys/resolve`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
        },
        body: JSON.stringify({ rawKey }),
      });
      if (!res.ok) throw new UnauthorizedException('invalid or revoked API key');
      const resolved = (await res.json()) as { tenantId: string; scopes: string[] };
      req.user = { sub: null, tenant_id: resolved.tenantId, role: 'api-key', scopes: resolved.scopes, email: null };
      return true;
    }

    return this.jwtGuard.canActivate(context) as Promise<boolean>;
  }
}
