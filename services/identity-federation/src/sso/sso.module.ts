// Wires sso's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { SsoConnectionsService } from './sso-connections.service';
import { SsoConnectionsController } from './sso-connections.controller';
import { OidcLoginService } from './oidc-login.service';
import { OidcLoginController } from './oidc-login.controller';
import { SamlSpService } from './saml-sp.service';
import { SamlSpController } from './saml-sp.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [SsoConnectionsService, OidcLoginService, SamlSpService],
  controllers: [SsoConnectionsController, OidcLoginController, SamlSpController],
})
export class SsoModule {}
