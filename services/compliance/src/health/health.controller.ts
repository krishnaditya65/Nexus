import { Controller, Get, HttpCode, ServiceUnavailableException } from '@nestjs/common';
import { pool } from '../db/pool';

// Standardized health/readiness endpoint (docs/FEATURES.md §11.10 —
// "no enforced convention" across the platform's 17 services until this
// pass). Deliberately unauthenticated — a load balancer/orchestrator
// probing readiness has no user session, and a health check that itself
// requires a valid JWT can't distinguish "service is down" from "auth
// is down", which defeats the point when auth-service itself is what's
// unhealthy. `ok` requires a real `select 1` round trip against
// Postgres, not just "the process is running" — an HTTP server can be
// up and accepting connections while its DB pool is fully exhausted or
// unreachable, which is exactly the state a readiness probe needs to
// catch and a liveness-only check would miss. A degraded DB throws a
// real 503 (not a 200 with a "status: degraded" body an orchestrator's
// HTTP-status-only probe would never notice) — the body is still
// attached via NestJS's default exception response shape.
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(200)
  async check() {
    const startedAt = Date.now();
    try {
      await pool.query('select 1');
      return {
        status: 'ok',
        service: 'compliance',
        dbConnected: true,
        checkedInMs: Date.now() - startedAt,
        uptimeSeconds: Math.round(process.uptime()),
        memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      };
    } catch (err) {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'compliance',
        dbConnected: false,
        error: err instanceof Error ? err.message : String(err),
        uptimeSeconds: Math.round(process.uptime()),
      });
    }
  }
}
