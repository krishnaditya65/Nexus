// Verify-only auth module: this service trusts tokens issued by services/auth and never issues its own — see JwtStrategy for the JWKS-based RS256 verification it wires up.
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [PassportModule],
  providers: [JwtStrategy],
})
export class AuthModule {}
