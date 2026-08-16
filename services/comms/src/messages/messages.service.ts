import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import Redis from 'ioredis';
import { withTenant } from '../db/pool';
import { ChannelsService } from '../channels/channels.service';
import { reactionsAggSql, chatRedisChannel } from './message-sql.util';

export { reactionsAggSql, chatRedisChannel };

/** One publisher connection, shared — ioredis connections used for
 *  publishing stay usable for normal commands, unlike subscriber
 *  connections (see chat.gateway.ts, which needs a *separate* connection
 *  because a subscribed connection can only issue subscribe/unsubscribe). */
const redisPublisher = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379');

// No insecure fallback — see retention-internal.controller.ts and
// calls.service.ts's identical fix. Fail closed at startup instead of
// silently authenticating internal calls with a hardcoded string.
if (!process.env.INTERNAL_SERVICE_SECRET) {
  throw new Error('INTERNAL_SERVICE_SECRET must be set');
}
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET;

@Injectable()
export class MessagesService {
  private readonly logger = new Logger(MessagesService.name);

  constructor(private readonly channels: ChannelsService) {}

  /**
   * `mentionedUserIds` is supplied explicitly by the caller (the frontend
   * builds it from its own @-autocomplete picker over real channel
   * members), not parsed out of free-text `@name` tokens — the same
   * "the client already knows who was picked, don't re-derive it from
   * ambiguous text" reasoning Slack/Teams's own compose UIs use under the
   * hood. Each mentioned id is validated as an actual channel member
   * before a notification goes out, and the author never notifies
   * themselves for mentioning their own name.
   */
  async post(
    tenantId: string,
    channelId: string,
    authorUserId: string,
    body: string,
    parentMessageId?: string,
    mentionedUserIds?: string[],
  ) {
    const isMember = await this.channels.isMember(tenantId, channelId, authorUserId);
    if (!isMember) throw new ForbiddenException('not a member of this channel');

    const message = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into messages (tenant_id, channel_id, author_user_id, body, parent_message_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, channelId, authorUserId, body, parentMessageId ?? null],
      );
      return rows[0];
    });

    // Fanout: services/comms's own WebSocket gateway subscribes to this
    // channel and forwards to connected clients — decoupling the write path
    // (this method) from delivery (chat.gateway.ts) means a slow/disconnected
    // websocket never blocks a message actually being saved.
    await redisPublisher.publish(chatRedisChannel(tenantId, channelId), JSON.stringify(message));

    if (mentionedUserIds?.length) {
      await this.notifyMentions(tenantId, channelId, authorUserId, message.id, body, mentionedUserIds);
    }

    // Fire-and-forget indexing into ai-platform's unified semantic search
    // (§11.8 — previously tickets-only). Never blocks message delivery.
    this.indexForSearch(tenantId, message).catch((err) =>
      this.logger.warn(`failed to index message ${message.id} for search: ${err}`),
    );

    return { ...message, reactions: [] as unknown[] };
  }

  private async indexForSearch(tenantId: string, message: { id: string; body: string }) {
    const aiPlatformUrl = process.env.AI_PLATFORM_SERVICE_URL ?? 'http://localhost:4008';
    await fetch(`${aiPlatformUrl}/internal/embeddings/index`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ tenantId, sourceType: 'chat_message', sourceId: message.id, content: message.body }),
    });
  }

  private async notifyMentions(
    tenantId: string,
    channelId: string,
    authorUserId: string,
    messageId: string,
    body: string,
    mentionedUserIds: string[],
  ) {
    const channel = await this.channels.get(tenantId, channelId);
    const validRecipients: string[] = [];
    for (const userId of new Set(mentionedUserIds)) {
      if (userId === authorUserId) continue; // don't notify yourself
      if (await this.channels.isMember(tenantId, channelId, userId)) validRecipients.push(userId);
    }
    if (validRecipients.length === 0) return;

    const notificationsUrl = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
    const truncatedBody = body.length > 140 ? `${body.slice(0, 140)}…` : body;
    for (const userId of validRecipients) {
      try {
        await fetch(`${notificationsUrl}/internal/notifications/send`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-internal-secret': INTERNAL_SECRET,
          },
          body: JSON.stringify({
            tenantId,
            userId,
            title: `You were mentioned in #${channel?.name ?? 'a channel'}`,
            body: truncatedBody,
            category: 'mention',
          }),
        });
      } catch (err) {
        // A failed page-out shouldn't fail the message post itself — the
        // message is already saved and delivered over the socket; this is
        // best-effort follow-up, same stance runner.service.ts's CI-minutes
        // metering and incident-management's commander paging both take.
        this.logger.warn(`failed to notify mention for user ${userId} on message ${messageId}: ${err}`);
      }
    }
  }

  async history(tenantId: string, channelId: string, userId: string, limit = 50) {
    const isMember = await this.channels.isMember(tenantId, channelId, userId);
    if (!isMember) throw new ForbiddenException('not a member of this channel');

    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select m.*, ${reactionsAggSql(3)}
         from messages m where channel_id = $1 order by created_at desc limit $2`,
        [channelId, limit, userId],
      );
      return rows.reverse();
    });
  }

  /** A thread is the parent message plus every reply pointing at it
   *  (parent_message_id = parentId) — messages.parent_message_id existed
   *  since this service's first migration, but nothing read it back as a
   *  grouped thread until now; history()/the realtime feed both still
   *  show every message (including replies) in the flat stream, same as
   *  Slack showing a reply's parent-channel preview even though the full
   *  thread lives in its own view. */
  async thread(tenantId: string, channelId: string, parentId: string, userId: string) {
    const isMember = await this.channels.isMember(tenantId, channelId, userId);
    if (!isMember) throw new ForbiddenException('not a member of this channel');

    return withTenant(tenantId, async (client) => {
      const parentRes = await client.query(
        `select m.*, ${reactionsAggSql(3)} from messages m where id = $1 and channel_id = $2`,
        [parentId, channelId, userId],
      );
      if (!parentRes.rows[0]) throw new NotFoundException('message not found');

      const repliesRes = await client.query(
        `select m.*, ${reactionsAggSql(2)}
         from messages m where parent_message_id = $1 order by created_at asc`,
        [parentId, userId],
      );
      return { parent: parentRes.rows[0], replies: repliesRes.rows };
    });
  }

  /** Full-text search scoped to one channel (the caller must already be
   *  a member) via the generated `search_vector` tsvector column —
   *  ranked by ts_rank so the most relevant match, not just the most
   *  recent, sorts first. */
  async search(tenantId: string, channelId: string, userId: string, query: string, limit = 30) {
    const isMember = await this.channels.isMember(tenantId, channelId, userId);
    if (!isMember) throw new ForbiddenException('not a member of this channel');
    if (!query.trim()) return [];

    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select m.*, ${reactionsAggSql(4)},
                ts_rank(m.search_vector, plainto_tsquery('english', $2)) as rank
         from messages m
         where m.channel_id = $1 and m.search_vector @@ plainto_tsquery('english', $2)
         order by rank desc
         limit $3`,
        [channelId, query, limit, userId],
      );
      return rows;
    });
  }

  async addReaction(tenantId: string, channelId: string, messageId: string, userId: string, emoji: string) {
    const isMember = await this.channels.isMember(tenantId, channelId, userId);
    if (!isMember) throw new ForbiddenException('not a member of this channel');
    if (typeof emoji !== 'string' || !emoji.trim()) throw new BadRequestException('emoji is required');

    return withTenant(tenantId, async (client) => {
      await client.query(
        `insert into message_reactions (message_id, tenant_id, user_id, emoji)
         values ($1, $2, $3, $4)
         on conflict (message_id, user_id, emoji) do nothing`,
        [messageId, tenantId, userId, emoji],
      );
      const { rows } = await client.query(
        `select emoji, count(*)::int as count from message_reactions where message_id = $1 group by emoji`,
        [messageId],
      );
      return rows;
    });
  }

  async removeReaction(tenantId: string, channelId: string, messageId: string, userId: string, emoji: string) {
    const isMember = await this.channels.isMember(tenantId, channelId, userId);
    if (!isMember) throw new ForbiddenException('not a member of this channel');

    return withTenant(tenantId, async (client) => {
      await client.query(
        `delete from message_reactions where message_id = $1 and user_id = $2 and emoji = $3`,
        [messageId, userId, emoji],
      );
      const { rows } = await client.query(
        `select emoji, count(*)::int as count from message_reactions where message_id = $1 group by emoji`,
        [messageId],
      );
      return rows;
    });
  }

  /** §11.10 data retention/purge enforcement, real for THIS one data
   *  class ('chat_history'): permanently deletes messages older than
   *  `olderThanDays`. `message_reactions` cascades on delete; any reply
   *  whose parent gets purged has its `parent_message_id` set to null
   *  (schema-level `on delete set null`), not orphan-deleted itself — an
   *  old reply is still real chat history even once its parent ages out.
   *  Called by services/compliance, which owns the actual retentionDays
   *  CONFIGURATION (backup_policies.retention_days) — this service only
   *  knows how to purge, not what the retention policy number should be,
   *  same separation-of-concerns every other cross-service call in this
   *  platform keeps. */
  async purgeOlderThan(tenantId: string, olderThanDays: number) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(
        `delete from messages where tenant_id = $1 and created_at < now() - ($2 || ' days')::interval`,
        [tenantId, olderThanDays],
      );
      return { deletedCount: rowCount ?? 0 };
    });
  }
}
