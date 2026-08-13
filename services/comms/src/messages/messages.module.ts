// Wires messages's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { MessagesService } from './messages.service';
import { MessagesController } from './messages.controller';
import { RetentionInternalController } from './retention-internal.controller';
import { AuthModule } from '../auth/auth.module';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [AuthModule, ChannelsModule],
  providers: [MessagesService],
  controllers: [MessagesController, RetentionInternalController],
})
export class MessagesModule {}
