import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';
import Redis from 'ioredis';
import { ChannelsService } from '../channels/channels.service';
import { chatRedisChannel } from '../messages/messages.service';

// Same JWKS endpoint jwt.strategy.ts (the REST guard) already trusts —
// socket.io has no passport integration, so the handshake verifies by
// hand instead of via passport-jwt, but against the identical RS256
// keypair. See jwt.strategy.ts's docblock for why JWKS over a shared
// secret: this service never holds anything capable of forging a token.
const jwks = jwksClient({
  jwksUri: `${process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001'}/.well-known/jwks.json`,
  cache: true,
  cacheMaxAge: 10 * 60 * 1000,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
});

function getSigningKey(header: jwt.JwtHeader, callback: (err: Error | null, key?: string) => void) {
  if (!header.kid) {
    callback(new Error('token missing kid'));
    return;
  }
  jwks.getSigningKey(header.kid, (err, key) => {
    if (err || !key) {
      callback(err ?? new Error('unknown kid'));
      return;
    }
    callback(null, key.getPublicKey());
  });
}

function verifyToken(token: string): Promise<{ sub: string; tenant_id: string }> {
  return new Promise((resolve, reject) => {
    jwt.verify(token, getSigningKey, { algorithms: ['RS256'] }, (err, decoded) => {
      if (err || !decoded) {
        reject(err ?? new Error('empty payload'));
        return;
      }
      resolve(decoded as { sub: string; tenant_id: string });
    });
  });
}

interface AuthenticatedSocketData {
  tenantId: string;
  userId: string;
}

/**
 * Realtime delivery layer. Messages are written durably via
 * MessagesController -> MessagesService (REST, see messages.service.ts),
 * which publishes to Redis; this gateway is purely a Redis-subscriber ->
 * WebSocket-room fanout, so a client that's offline when a message is sent
 * just fetches history via GET .../messages on reconnect — no delivery
 * guarantee is owed to the websocket layer itself.
 *
 * Uses its own Redis connection (never the shared publisher from
 * messages.service.ts) because a connection in SUBSCRIBE mode can only
 * issue subscribe/unsubscribe/psubscribe commands — ioredis enforces this,
 * and sharing one connection for both roles would break publishing.
 */
@WebSocketGateway({ cors: { origin: '*' } })
export class ChatGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(ChatGateway.name);
  private readonly redisSubscriber = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

  @WebSocketServer()
  server!: Server;

  constructor(private readonly channels: ChannelsService) {
    // One pattern-subscribe covers every tenant/channel combination this
    // process will ever need — Socket.IO rooms (not per-tenant Redis
    // subscriptions) are what actually scope delivery to the right clients.
    this.redisSubscriber.psubscribe('chat:*:*');
    this.redisSubscriber.on('pmessage', (_pattern, channel, rawMessage) => {
      this.server.to(channel).emit('message', JSON.parse(rawMessage));
    });
  }

  /**
   * Registers a Socket.IO handshake middleware rather than verifying the
   * token in handleConnection — a real bug found live-testing this exact
   * migration off HS256: verifyToken now does a network round-trip (JWKS
   * fetch), and handleConnection alone doesn't block the client's
   * *following* messages from being processed while that's in flight. A
   * client that emits 'join' immediately after 'connect' (every real
   * client does — see apps/web's useRealtimeMessages) would race ahead of
   * an async handleConnection and hit handleJoin with socket.data still
   * empty, always failing the membership check. io.use() middleware runs
   * to completion (or calls next(err) to reject) BEFORE the handshake
   * itself completes, so 'connect' never fires on the client — and no
   * message handler can run — until auth is actually resolved.
   */
  afterInit(server: Server) {
    server.use((socket: Socket, next: (err?: Error) => void) => {
      const token = socket.handshake.auth?.token as string | undefined;
      if (!token) {
        next(new Error('missing token'));
        return;
      }
      verifyToken(token)
        .then((claims) => {
          (socket.data as AuthenticatedSocketData) = { tenantId: claims.tenant_id, userId: claims.sub };
          next();
        })
        .catch((err) => {
          this.logger.warn(`socket handshake rejected: invalid token (${err})`);
          next(new Error('invalid token'));
        });
    });
  }

  handleConnection(socket: Socket) {
    this.logger.debug(`socket ${socket.id} connected as user ${(socket.data as AuthenticatedSocketData).userId}`);

    // 'disconnecting' (not 'disconnect') is the one Socket.IO lifecycle
    // point where `socket.rooms` is STILL populated — by the time
    // NestJS's own OnGatewayDisconnect ('disconnect') fires, Socket.IO
    // has already emptied it, which would make a vanished call peer
    // (closed tab, lost network) silently leave every room it was in
    // with no 'call:peer-left' ever sent to its remaining peers. Hooked
    // here (not as its own @SubscribeMessage — 'disconnecting' isn't a
    // client-emitted event) rather than a bare handleDisconnect body.
    socket.on('disconnecting', () => {
      for (const room of socket.rooms) {
        if (room.startsWith('call:')) {
          socket.to(room).emit('call:peer-left', { socketId: socket.id });
        }
      }
    });
  }

  handleDisconnect(socket: Socket) {
    this.logger.debug(`socket ${socket.id} disconnected`);
  }

  @SubscribeMessage('join')
  async handleJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { channelId: string }) {
    const { tenantId, userId } = socket.data as AuthenticatedSocketData;
    const isMember = await this.channels.isMember(tenantId, body.channelId, userId);
    if (!isMember) {
      socket.emit('error', { message: 'not a member of this channel' });
      return;
    }
    await socket.join(chatRedisChannel(tenantId, body.channelId));
  }

  @SubscribeMessage('leave')
  async handleLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: { channelId: string }) {
    const { tenantId } = socket.data as AuthenticatedSocketData;
    await socket.leave(chatRedisChannel(tenantId, body.channelId));
  }

  // --- WebRTC call signaling relay (docs/FEATURES.md §11.6) — see
  // services/comms/migrations/003_calls.sql's docblock for why this is a
  // MESH-topology relay (offer/answer/ICE candidates only), never touching
  // actual audio/video/screen-share media, which flows peer-to-peer once
  // signaling completes. Reuses this same authenticated gateway rather
  // than standing up a second one — the auth handshake middleware above
  // already covers these events too. ---

  private callRoom(tenantId: string, callId: string): string {
    return `call:${tenantId}:${callId}`;
  }

  /** Joining a call's signaling room. Existing participants are told a
   *  new peer arrived (so THEY initiate the offer to the newcomer — a
   *  fixed, one-directional "existing member offers to newcomer"
   *  convention that avoids both sides racing to send simultaneous
   *  offers); the newcomer gets back the list of who's already there. */
  @SubscribeMessage('call:join')
  async handleCallJoin(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string }) {
    const { tenantId, userId } = socket.data as AuthenticatedSocketData;
    const room = this.callRoom(tenantId, body.callId);
    const existingSocketIds = [...(this.server.sockets.adapter.rooms.get(room) ?? [])];
    await socket.join(room);
    socket.to(room).emit('call:peer-joined', { socketId: socket.id, userId });
    socket.emit('call:existing-peers', { peers: existingSocketIds });
  }

  @SubscribeMessage('call:leave')
  async handleCallLeave(@ConnectedSocket() socket: Socket, @MessageBody() body: { callId: string }) {
    const { tenantId } = socket.data as AuthenticatedSocketData;
    const room = this.callRoom(tenantId, body.callId);
    await socket.leave(room);
    socket.to(room).emit('call:peer-left', { socketId: socket.id });
  }

  /** The actual relay — an SDP offer/answer or ICE candidate, addressed
   *  to one specific peer's socket id within the room (never broadcast:
   *  each pairwise connection in the mesh negotiates independently). The
   *  payload itself is opaque to the server — it never parses or
   *  validates WebRTC signaling internals, only routes it. */
  @SubscribeMessage('call:signal')
  handleCallSignal(
    @ConnectedSocket() socket: Socket,
    @MessageBody() body: { targetSocketId: string; signal: unknown },
  ) {
    // Never relay to an arbitrary client-supplied socket id — reuse the
    // same `call:<tenantId>:<callId>` room membership handleCallJoin
    // established: the sender must currently be in a call room, and the
    // target socket must be in that SAME room, or this is either a stale
    // peer id or an attempt to signal a socket outside the sender's call.
    const room = [...socket.rooms].find((r) => r.startsWith('call:'));
    if (!room) {
      socket.emit('error', { message: 'not currently in a call' });
      return;
    }
    const targetSocket = this.server.sockets.sockets.get(body.targetSocketId);
    if (!targetSocket || !targetSocket.rooms.has(room)) {
      socket.emit('error', { message: 'signal target is not a peer in this call' });
      return;
    }
    this.server.to(body.targetSocketId).emit('call:signal', { fromSocketId: socket.id, signal: body.signal });
  }
}
