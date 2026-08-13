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
import { JwtModule } from '@nestjs/jwt';
import { FederationInternalController } from './federation-internal.controller';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { KeysModule } from '../keys/keys.module';
import { KeyManagementService } from '../keys/key-management.service';

@Module({
  imports: [
    KeysModule,
    JwtModule.registerAsync({
      imports: [KeysModule],
      inject: [KeyManagementService],
      useFactory: (keys: KeyManagementService) => ({
        privateKey: keys.getPrivateKeyPem(),
        publicKey: keys.getPublicKeyPem(),
        signOptions: { algorithm: 'RS256', expiresIn: '1h', keyid: keys.getKeyId() },
        verifyOptions: { algorithms: ['RS256'] },
      }),
    }),
    TenantsModule,
    UsersModule,
  ],
  controllers: [FederationInternalController],
})
export class FederationModule {}
