// Wires incidents's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { IncidentsService } from './incidents.service';
import { IncidentsController } from './incidents.controller';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  providers: [IncidentsService],
  controllers: [IncidentsController],
})
export class IncidentsModule {}
