// Verifies JWTs this same service issued, for its own guarded routes.
// Unlike every other service's JwtStrategy (see their jwt.strategy.ts),
// this one doesn't fetch a JWKS document over HTTP — the RS256 keypair
// already lives in-process via KeyManagementService (this service IS the
// issuer), so verification is a pure local public-key check.
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { KeyManagementService } from '../keys/key-management.service';
import { SessionsService } from '../sessions/sessions.service';

export interface JwtClaims {
  sub: string; // user id
  tenant_id: string;
  role: string;
  email: string;
  sid?: string; // session id — see sessions/sessions.service.ts; absent on pre-session-tracking tokens
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    keys: KeyManagementService,
    private readonly sessions: SessionsService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      algorithms: ['RS256'],
      secretOrKey: keys.getPublicKeyPem(),
    });
  }

  // Checked ONLY against auth-service's own routes — see sessions
  // migration's docblock for why this doesn't reach the other 16
  // services. A missing `sid` (a token issued before this feature
  // existed, or theoretically forged with a stripped claim) fails open
  // as valid rather than locking out every outstanding token at deploy
  // time; a token WITH a `sid` that's actually revoked fails closed.
  async validate(payload: JwtClaims): Promise<JwtClaims> {
    if (payload.sid) {
      const valid = await this.sessions.touchAndCheckValid(payload.tenant_id, payload.sid);
      if (!valid) throw new UnauthorizedException('session has been revoked');
    }
    return payload; // attached to request.user by passport
  }
}
