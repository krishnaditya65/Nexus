// Verify-only auth module: this service trusts tokens issued by services/auth and never issues its own — see JwtStrategy for the JWKS-based RS256 verification it wires up.
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { TenantAuthGuard } from './tenant-auth.guard';

/** Verify-only auth module — trusts tokens issued by auth-service, verified
 *  against auth-service's public JWKS document (RS256; see that service's
 *  src/keys/). This service never holds signing key material. Also
 *  exports TenantAuthGuard (§11.9) — accepts either a real session JWT or
 *  an `nexus_live_...` API key, resolved live against api-platform. */
@Module({
  imports: [PassportModule],
  providers: [JwtStrategy, JwtAuthGuard, TenantAuthGuard],
  exports: [JwtAuthGuard, TenantAuthGuard],
})
export class AuthModule {}
