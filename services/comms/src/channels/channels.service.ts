import { ForbiddenException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

/**
 * Channel lifecycle and membership. A channel is either a standing team
 * channel (created explicitly) or a ticket's own micro-chat (created
 * implicitly the first time someone messages a ticket — see
 * getOrCreateTicketChannel, called from services/pm indirectly via the
 * frontend, not a direct service-to-service call, to keep pm from needing
 * to know comms exists).
 */
@Injectable()
export class ChannelsService {
  async create(tenantId: string, name: string, isPrivate: boolean, createdByUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into channels (tenant_id, name, is_private, created_by_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, name, isPrivate, createdByUserId],
      );
      await client.query(
        `insert into channel_members (channel_id, tenant_id, user_id) values ($1, $2, $3)`,
        [rows[0].id, tenantId, createdByUserId],
      );
      return rows[0];
    });
  }

  /** Idempotent: the first user to open a ticket's chat creates its
   *  channel, everyone after just joins it. */
  async getOrCreateTicketChannel(tenantId: string, ticketId: string, requestingUserId: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select * from channels where tenant_id = $1 and ticket_id = $2`, [
        tenantId,
        ticketId,
      ]);
      if (existing.rows[0]) {
        await client.query(
          `insert into channel_members (channel_id, tenant_id, user_id) values ($1, $2, $3)
           on conflict do nothing`,
          [existing.rows[0].id, tenantId, requestingUserId],
        );
        return existing.rows[0];
      }
      const { rows } = await client.query(
        `insert into channels (tenant_id, name, is_private, ticket_id, created_by_user_id)
         values ($1, $2, true, $3, $4) returning *`,
        [tenantId, `ticket-${ticketId}`, ticketId, requestingUserId],
      );
      await client.query(`insert into channel_members (channel_id, tenant_id, user_id) values ($1, $2, $3)`, [
        rows[0].id,
        tenantId,
        requestingUserId,
      ]);
      return rows[0];
    });
  }

  /** Used by MessagesService's @mention notifier to name the channel in
   *  the push notification's title ("mentioned in #general"). */
  async get(tenantId: string, channelId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from channels where id = $1`, [channelId]);
      return rows[0] ?? null;
    });
  }

  /** `requestingUserId` must already be a member of the channel — this
   *  schema has no channel-admin concept (channel_members carries no role
   *  column, see 001_init.sql), so "already in the channel" is the only
   *  permission this codebase has to check, same bar isMember()-gated
   *  methods elsewhere in this file (post/history/etc. in
   *  MessagesService) apply. Without this, any authenticated user could
   *  add anyone to any channel, private ones included. */
  async addMember(tenantId: string, channelId: string, userId: string, requestingUserId: string) {
    const requesterIsMember = await this.isMember(tenantId, channelId, requestingUserId);
    if (!requesterIsMember) throw new ForbiddenException('not a member of this channel');

    return withTenant(tenantId, async (client) => {
      await client.query(
        `insert into channel_members (channel_id, tenant_id, user_id) values ($1, $2, $3)
         on conflict do nothing`,
        [channelId, tenantId, userId],
      );
      return { status: 'joined' };
    });
  }

  async listMembers(tenantId: string, channelId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select user_id from channel_members where channel_id = $1`, [channelId]);
      return rows.map((r) => r.user_id);
    });
  }

  async isMember(tenantId: string, channelId: string, userId: string): Promise<boolean> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select 1 from channel_members where channel_id = $1 and user_id = $2`,
        [channelId, userId],
      );
      return rows.length > 0;
    });
  }

  /** Channels a user belongs to — what a client renders in its sidebar. */
  async listForUser(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select c.* from channels c
         join channel_members m on m.channel_id = c.id
         where c.tenant_id = $1 and m.user_id = $2
         order by c.created_at`,
        [tenantId, userId],
      );
      return rows;
    });
  }
}
