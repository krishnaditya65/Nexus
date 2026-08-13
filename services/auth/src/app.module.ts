// auth service — tenants, users, JWT issuance/verification, immutable audit log, internal federation hooks for SCIM/OIDC provisioning.
import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { TenantsModule } from './tenants/tenants.module';
import { UsersModule } from './users/users.module';
import { FederationModule } from './federation/federation.module';
import { AuditModule } from './audit/audit.module';
import { SessionsModule } from './sessions/sessions.module';
import { HealthModule } from './health/health.module';
import { RolesModule } from './roles/roles.module';

@Module({
  imports: [
    AuthModule,
    TenantsModule,
    UsersModule,
    FederationModule,
    AuditModule,
    SessionsModule,
    HealthModule,
    RolesModule,
  ],
})
export class AppModule {}
