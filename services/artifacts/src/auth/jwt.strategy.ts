// Verifies JWTs issued by services/auth's RS256 keypair, exactly like
// every other service — npm's client sends the configured
// `//registry-host/:_authToken` value as a plain `Authorization: Bearer
// <token>` header, which is exactly this platform's normal JWT, so a
// `.npmrc` pointed at this registry authenticates the same way any other
// API call does — no separate npm-specific auth scheme to build.
import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';

export interface JwtClaims {
  sub: string;
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
        cacheMaxAge: 10 * 60 * 1000,
        rateLimit: true,
        jwksRequestsPerMinute: 5,
        jwksUri: `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001'}/.well-known/jwks.json`,
      }),
    });
  }

  async validate(payload: JwtClaims): Promise<JwtClaims> {
    return payload;
  }
}
