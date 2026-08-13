// Process entrypoint — bootstraps this service's NestJS application and starts listening on PORT.
import { initTracing } from '@nexus/tracing';
initTracing('comms');

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe, VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import { json } from 'express';
import { AppModule } from './app.module';
import { RedisIoAdapter } from './redis-io.adapter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // Horizontal-scaling fix for WebRTC call signaling (docs/
  // HORIZONTAL_SCALING.md, docs/FEATURES.md §11.10) — see
  // redis-io.adapter.ts's docblock for the real bug this closes.
  const redisIoAdapter = new RedisIoAdapter(app);
  await redisIoAdapter.connectToRedis();
  app.useWebSocketAdapter(redisIoAdapter);
  // API versioning (docs/FEATURES.md §11.10) — URI versioning with a
  // VERSION_NEUTRAL default: every existing route keeps responding at its
  // current, unversioned path forever (zero behavior change for every
  // existing API-key consumer) — only a route explicitly decorated
  // @Version('1') (or a future '2') gets a /v1/... prefix. See
  // docs/API_VERSIONING.md for the full strategy.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
  // Call recordings (docs/FEATURES.md §11.6) are uploaded base64-encoded
  // inside a JSON body, same convention services/artifacts's package
  // publish endpoint already uses for tarballs — a raised body-size limit
  // is that same tradeoff, not something new to this service.
  app.use(json({ limit: '100mb' }));
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();
  const port = process.env.PORT ?? 4004;
  await app.listen(port);
  console.log(`[comms] listening on :${port} (REST + WebSocket)`);
}
bootstrap();
