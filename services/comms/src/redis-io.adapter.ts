import { IoAdapter } from '@nestjs/platform-socket.io';
import { ServerOptions } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';

/**
 * Fixes the real, previously-undocumented horizontal-scaling gap
 * surfaced in docs/HORIZONTAL_SCALING.md: `ChatGateway`'s WebRTC call-
 * signaling relay (`handleCallJoin`/`handleCallSignal`, §11.6) reads
 * `this.server.sockets.adapter.rooms` and does `this.server.to(
 * targetSocketId).emit(...)` — both against Socket.IO's DEFAULT
 * in-memory adapter, which only knows about sockets connected to THIS
 * process. Two call participants landing on different replicas behind a
 * load balancer would silently fail to signal each other; a room's
 * member list would be incomplete for anyone joining from a different
 * replica.
 *
 * `@socket.io/redis-adapter` is the standard, off-the-shelf fix: it
 * makes room membership AND targeted-socket-id emits (`server.to(
 * targetSocketId)` — every socket auto-joins a room named after its own
 * id, so a targeted emit really is just a to-room emit) work correctly
 * across every replica subscribed to the same Redis instance, with zero
 * changes needed to `ChatGateway`'s own code.
 *
 * `messages.service.ts`'s hand-rolled `chatRedisChannel` pub/sub bridge
 * (for chat message delivery specifically) already worked correctly
 * across replicas on its own and is left in place — this adapter makes
 * it functionally redundant for that one path (the adapter would now
 * carry chat message broadcasts too), but removing working, already-
 * correct code in the same pass as adding this fix is a needless risk
 * with no live infra to verify the removal against; a real, disclosed
 * cleanup follow-up, not done here.
 */
export class RedisIoAdapter extends IoAdapter {
  private adapterConstructor?: ReturnType<typeof createAdapter>;

  async connectToRedis(): Promise<void> {
    const url = process.env.REDIS_URL ?? 'redis://localhost:6379';
    const pubClient = new Redis(url);
    const subClient = pubClient.duplicate();
    this.adapterConstructor = createAdapter(pubClient, subClient);
  }

  createIOServer(port: number, options?: ServerOptions) {
    const server = super.createIOServer(port, options);
    if (this.adapterConstructor) {
      server.adapter(this.adapterConstructor);
    }
    return server;
  }
}
