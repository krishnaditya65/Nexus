// The only module in the platform that both SIGNS and verifies JWTs. Signs
// with KeyManagementService's RS256 private key (JwtModule.registerAsync
// below); verifies its own protected routes locally against the same
// keypair's public half via JwtStrategy — no network round-trip to its own
// JWKS endpoint needed since the key material is already in-process. Every
// other service instead fetches this service's /.well-known/jwks.json (see
// services/keys/jwks.controller.ts) and never sees a private key at all.
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { TenantsModule } from '../tenants/tenants.module';
import { UsersModule } from '../users/users.module';
import { AuditModule } from '../audit/audit.module';
import { KeysModule } from '../keys/keys.module';
import { KeyManagementService } from '../keys/key-management.service';
import { MfaModule } from '../mfa/mfa.module';
import { SessionsModule } from '../sessions/sessions.module';
import { WebauthnModule } from '../webauthn/webauthn.module';
import { RolesModule } from '../roles/roles.module';
import { GeoIpService } from '../geo/geoip.service';
import { DevicesService } from '../devices/devices.service';

@Module({
  imports: [
    PassportModule,
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
    AuditModule,
    MfaModule,
    SessionsModule,
    WebauthnModule,
    RolesModule,
  ],
  providers: [AuthService, JwtStrategy, GeoIpService, DevicesService],
  controllers: [AuthController],
  // FederationInternalController mints tokens through this same
  // AuthService.issueToken so SSO/SCIM-provisioned logins carry the exact
  // same sid/is_guest/permissions claims as a normal login.
  exports: [AuthService],
})
export class AuthModule {}
