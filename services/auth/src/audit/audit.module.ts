// Wires audit's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { AuditController } from './audit.controller';

// Deliberately does NOT import AuthModule: AuditController only needs the
// JwtAuthGuard class (imported directly, like UsersController does), and
// AuthModule needs to import AuditModule (for AuthService to record login
// events) — importing AuthModule back here would be circular.
@Module({
  providers: [AuditService],
  controllers: [AuditController],
  exports: [AuditService],
})
export class AuditModule {}
