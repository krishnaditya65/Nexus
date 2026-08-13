// Wires scim's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { ScimUsersController } from './scim-users.controller';
import { ScimUsersService } from './scim-users.service';
import { ScimTokensController } from './scim-tokens.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ScimUsersController, ScimTokensController],
  providers: [ScimUsersService],
})
export class ScimModule {}
