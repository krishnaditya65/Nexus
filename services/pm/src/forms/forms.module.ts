import { Module } from '@nestjs/common';
import { FormsService } from './forms.service';
import { FormsController } from './forms.controller';
import { AuthModule } from '../auth/auth.module';
import { TicketsModule } from '../tickets/tickets.module';

@Module({
  imports: [AuthModule, TicketsModule],
  providers: [FormsService],
  controllers: [FormsController],
})
export class FormsModule {}
