import { Module } from '@nestjs/common';
import { TicketTemplatesService } from './ticket-templates.service';
import { TicketTemplatesController } from './ticket-templates.controller';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [AuthModule, TicketsModule],
  providers: [TicketTemplatesService],
  controllers: [TicketTemplatesController],
})
export class TicketTemplatesModule {}
