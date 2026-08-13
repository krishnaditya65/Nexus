import { CanActivate, ExecutionContext, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { TokenBucketConfig, TokenBucketLimiter } from './token-bucket';

/**
 * Factory rather than a fixed class — each service picks its own bucket
 * capacity/refill rate for its own resource (pm's ticket-write endpoints
 * look nothing like git-host's push endpoints), while sharing one
 * correctness-tested limiter implementation. Usage:
 *
 *   @UseGuards(createTenantRateLimitGuard(redisClient, 'pm:tickets:write', { capacity: 60, refillPerSecond: 1 }))
 */
export function createTenantRateLimitGuard(
  redis: Redis,
  resourceName: string,
  config: TokenBucketConfig,
) {
  // A closure variable, not a class field: a field on this exported
  // anonymous class would force TypeScript to expose TokenBucketLimiter's
  // shape in the generated .d.ts, which fails declaration emit for an
  // unnamed class type. The closure keeps the limiter private in practice
  // without that constraint.
  const limiter = new TokenBucketLimiter(redis);

  @Injectable()
  class TenantRateLimitGuard implements CanActivate {
    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest();
      // Every guarded route in this platform runs after JwtAuthGuard/
      // ApiKeyGuard, both of which stamp a tenant identifier onto the
      // request — reuse whichever is present rather than requiring a
      // specific auth mechanism.
      const tenantId: string | undefined = req.user?.tenant_id ?? req.apiKeyContext?.tenantId;
      if (!tenantId) {
        // No tenant context means no earlier auth guard ran — that's a
        // wiring bug in the consuming service, not something to silently
        // rate-limit around.
        throw new HttpException('rate limiter requires tenant context from an earlier auth guard', 500);
      }

      const bucketKey = `ratelimit:${resourceName}:${tenantId}`;
      const result = await limiter.consume(bucketKey, config);
      req.res?.setHeader?.('X-RateLimit-Remaining', Math.floor(result.remainingTokens));

      if (!result.allowed) {
        throw new HttpException(
          { message: 'rate limit exceeded for this tenant', resource: resourceName },
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      return true;
    }
  }

  return TenantRateLimitGuard;
}
