// Wires chat-gateway's providers/controllers into the Nest DI graph — no business logic of its own; see the sibling .service.ts for that.
import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChannelsModule } from '../channels/channels.module';

@Module({
  imports: [ChannelsModule],
  providers: [ChatGateway],
})
export class ChatGatewayModule {}
