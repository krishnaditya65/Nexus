// artifacts service — a real npm-registry-protocol-compatible package
// feed (docs/FEATURES.md §4/§10 "Artifacts/package registry"). See
// PackagesService's docblock for exact protocol scope.
import { Module } from '@nestjs/common';
import { PackagesModule } from './packages/packages.module';
import { HealthModule } from './health/health.module';

@Module({
  // HealthModule MUST be registered before PackagesModule — the npm-
  // registry-protocol routes below include a catch-all `GET /:package`
  // (any single path segment is a valid npm package name), which would
  // otherwise shadow `GET /health` outright: Nest/Express match routes
  // in registration order for the same method, so a broader param route
  // registered first wins over a literal path registered after it. Found
  // live: the health endpoint 401'd against PackagesController's auth
  // instead of ever reaching HealthController.
  imports: [HealthModule, PackagesModule],
})
export class AppModule {}
