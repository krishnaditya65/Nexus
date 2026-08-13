// identity-federation service — SCIM 2.0 provisioning + OIDC SSO.
import { Module } from '@nestjs/common';
import { ScimModule } from './scim/scim.module';
import { SsoModule } from './sso/sso.module';
import { HealthModule } from './health/health.module';

@Module({
  imports: [ScimModule, SsoModule, HealthModule],
})
export class AppModule {}
