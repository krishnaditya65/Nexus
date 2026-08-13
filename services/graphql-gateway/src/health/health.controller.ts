import { Controller, Get, HttpCode } from '@nestjs/common';

// Same standardized health/readiness shape every other service in this
// platform uses (docs/FEATURES.md §11.10) — no Postgres of its own here
// (this service holds no data, only composes REST calls), so there's no
// DB round trip to check; "the process is up and can respond" IS the
// whole health signal for a pure gateway/proxy service.
@Controller('health')
export class HealthController {
  @Get()
  @HttpCode(200)
  check() {
    return {
      status: 'ok',
      service: 'graphql-gateway',
      uptimeSeconds: Math.round(process.uptime()),
      memoryUsageMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
    };
  }
}
