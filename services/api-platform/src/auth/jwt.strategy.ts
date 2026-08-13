// Verifies JWTs issued by services/auth's RS256 keypair. Fetches the
// signing key from auth-service's public JWKS endpoint (RFC 7517) rather
// than trusting a shared secret — this service never holds anything
// capable of forging a token, only auth-service's KeyManagementService
// does (see that service's src/keys/). jwks-rsa caches the resolved key
// and rate-limits refetches, so this is a startup + occasional-refresh
// cost, not a per-request network call.
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

export interface JwtClaims {
  sub: string; // user id
  tenant_id: string;
  role: string;
  email: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        cacheMaxAge: 10 * 60 * 1000, // 10 min — matches token lifetime order of magnitude; short enough that a rotated key propagates promptly
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001'}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: JwtClaims): Promise<JwtClaims> {
    return payload; // attached to request.user by passport
  }
}
