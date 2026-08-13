import type { Redis } from 'ioredis';

/**
 * Redis-backed token-bucket limiter, shared across every service in this
 * platform via one package rather than reimplemented per service — the
 * "noisy neighbor" defense in a shared-Postgres multi-tenant model depends
 * on every service enforcing the same fair-use contract consistently.
 *
 * Implemented as a single Lua script (EVAL) so the read-modify-write of
 * refilling + consuming tokens is atomic — two concurrent requests from the
 * same tenant can't both read a stale bucket and both succeed when only one
 * should have.
 */
const TOKEN_BUCKET_LUA = `
local key = KEYS[1]
local capacity = tonumber(ARGV[1])
local refillPerSecond = tonumber(ARGV[2])
local requested = tonumber(ARGV[3])
local now = tonumber(ARGV[4])

local bucket = redis.call('HMGET', key, 'tokens', 'updatedAt')
local tokens = tonumber(bucket[1])
local updatedAt = tonumber(bucket[2])

if tokens == nil then
  tokens = capacity
  updatedAt = now
end

local elapsed = math.max(0, now - updatedAt)
tokens = math.min(capacity, tokens + elapsed * refillPerSecond)

local allowed = 0
if tokens >= requested then
  tokens = tokens - requested
  allowed = 1
end

redis.call('HMSET', key, 'tokens', tokens, 'updatedAt', now)
redis.call('EXPIRE', key, math.ceil(capacity / refillPerSecond) + 60)

return { allowed, tokens }
`;

export interface TokenBucketConfig {
  /** Max burst size — the bucket's full capacity. */
  capacity: number;
  /** Sustained rate the bucket refills at. */
  refillPerSecond: number;
}

export interface TokenBucketResult {
  allowed: boolean;
  remainingTokens: number;
}

export class TokenBucketLimiter {
  constructor(private readonly redis: Redis) {}

  /**
   * @param bucketKey Typically `tenant:{tenantId}:{resource}` — callers own
   *   the key shape so the same tenant can have independent buckets per
   *   resource (e.g. API calls vs. CI runner starts).
   */
  async consume(bucketKey: string, config: TokenBucketConfig, requested = 1): Promise<TokenBucketResult> {
    const nowSeconds = Date.now() / 1000;
    const result = (await this.redis.eval(
      TOKEN_BUCKET_LUA,
      1,
      bucketKey,
      config.capacity,
      config.refillPerSecond,
      requested,
      nowSeconds,
    )) as [number, string];

    return { allowed: result[0] === 1, remainingTokens: Number(result[1]) };
  }
}
