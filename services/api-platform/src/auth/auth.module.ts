// Verify-only auth module: this service trusts tokens issued by services/auth and never issues its own — see JwtStrategy for the JWKS-based RS256 verification it wires up.
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

/** Verify-only auth module — trusts tokens issued by auth-service, verified
 *  against auth-service's public JWKS document (RS256; see that service's
 *  src/keys/). This service never holds signing key material. */
@Module({
  imports: [PassportModule],
  providers: [JwtStrategy],
})
export class AuthModule {}
