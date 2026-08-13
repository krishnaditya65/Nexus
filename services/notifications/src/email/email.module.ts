// Wires email's provider/controller into the Nest DI graph — no business
// logic of its own; see email.service.ts for that.
import { Module } from '@nestjs/common';
import { EmailService } from './email.service';
import { EmailController } from './email.controller';

@Module({
  providers: [EmailService],
  controllers: [EmailController],
  exports: [EmailService],
})
export class EmailModule {}
