import Redis from 'ioredis';

/** One Redis connection per service process, reused across every rate
 *  limiter guard instance — matches how the pool.ts Postgres connection is
 *  shared rather than opened per request. */
export const redisClient = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');
