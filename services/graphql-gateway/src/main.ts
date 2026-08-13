// Process entrypoint — bootstraps this service's NestJS application and starts listening on PORT.
import { initTracing } from '@nexus/tracing';
initTracing('graphql-gateway');

import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { VersioningType, VERSION_NEUTRAL } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // API versioning (docs/FEATURES.md §11.10) — URI versioning with a
  // VERSION_NEUTRAL default: every existing route keeps responding at its
  // current, unversioned path forever (zero behavior change for every
  // existing API-key consumer) — only a route explicitly decorated
  // @Version('1') (or a future '2') gets a /v1/... prefix. See
  // docs/API_VERSIONING.md for the full strategy.
  app.enableVersioning({ type: VersioningType.URI, defaultVersion: VERSION_NEUTRAL });
  app.enableCors();
  const port = process.env.PORT ?? 4018;
  await app.listen(port);
  console.log(`[graphql-gateway] listening on :${port} (GraphQL at /graphql)`);
}
bootstrap();
