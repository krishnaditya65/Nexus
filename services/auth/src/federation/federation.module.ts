// Wires federation's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
//
// Bug fixed: this module used to register its own JwtModule with a plain
// HS256 shared secret, independent of KeyManagementService's RS256
// keypair. Every other issuer (auth.module.ts) signs RS256; every verifier
// platform-wide (all 14 other services' jwt.strategy.ts, plus git-host's
// keyfunc client) only trusts RS256 tokens whose kid resolves against
// /.well-known/jwks.json. That meant every SSO/SCIM-provisioned login
// (the only caller of upsertUser below) got handed a token that would be
// silently rejected by every downstream service the moment it was used —
// found by tracing the RS256 migration's actual coverage rather than by a
// failing request, since HS256-signed-but-syntactically-valid tokens don't
// error until something tries to verify them against the JWKS. Fixed by
// reusing the same RS256 keypair every other issuer/verifier already
// agrees on.
import { Module } from '@nestjs/common';
import { FederationInternalController } from './federation-internal.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TenantsModule,
    UsersModule,
    // Gives this controller AuthService.issueToken directly, so
    // upsert-user's token carries the same sid/is_guest/permissions claims
    // as a normal login instead of a separately hand-rolled jwt.sign() call
    // (that used to also mean a second, independent JwtModule/RS256 keypair
    // wiring here — see git history — now unnecessary).
    AuthModule,
  ],
  controllers: [FederationInternalController],
})
export class FederationModule {}
