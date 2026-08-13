import { Module } from '@nestjs/common';
import { ChannelsModule } from './channels/channels.module';
import { MessagesModule } from './messages/messages.module';
import { ChatGatewayModule } from './chat-gateway/chat-gateway.module';
import { CallsModule } from './calls/calls.module';
import { HealthModule } from './health/health.module';

/**
 * comms service — persistent chat channels + ticket micro-chats + realtime
 * delivery, plus WebRTC video/audio calls (§11.6 — mesh-topology
 * signaling relay via the same authenticated Socket.IO gateway used for
 * chat, call bookkeeping/recordings via CallsModule; see
 * migrations/003_calls.sql's docblock for the architecture and its
 * disclosed scope vs. a real SFU like LiveKit/Mediasoup). Calendar/
 * presence and whiteboarding remain ⚪, tracked in docs/FEATURES.md.
 */
@Module({
  imports: [ChannelsModule, MessagesModule, ChatGatewayModule, CallsModule, HealthModule],
})
export class AppModule {}
