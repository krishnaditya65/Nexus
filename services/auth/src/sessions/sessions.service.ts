import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class SessionsService {
  async create(tenantId: string, userId: string, ip: string | null, userAgent: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into sessions (tenant_id, user_id, ip, user_agent) values ($1, $2, $3, $4) returning id`,
        [tenantId, userId, ip, userAgent],
      );
      return rows[0].id as string;
    });
  }

  /** Called on every request through this service's own JwtAuthGuard (see
   *  jwt.strategy.ts) — returns false for a revoked or nonexistent
   *  session, which fails the request with 401 before it reaches a
   *  route handler. Also throttles the last_seen_at write to at most
   *  once per minute per session so this doesn't add a write to every
   *  single authenticated request. */
  async touchAndCheckValid(tenantId: string, sessionId: string): Promise<boolean> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update sessions set last_seen_at = now()
         where id = $1 and revoked_at is null and last_seen_at < now() - interval '1 minute'
         returning id`,
        [sessionId],
      );
      if (rows[0]) return true;
      // Either just touched within the last minute (still valid, no-op
      // write needed) or genuinely revoked/missing — distinguish the two.
      const { rows: existing } = await client.query(
        `select revoked_at from sessions where id = $1`,
        [sessionId],
      );
      return existing[0] ? existing[0].revoked_at === null : false;
    });
  }

  async listForUser(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, ip, user_agent, created_at, last_seen_at, revoked_at
         from sessions where tenant_id = $1 and user_id = $2 order by last_seen_at desc`,
        [tenantId, userId],
      );
      return rows;
    });
  }

  async revoke(tenantId: string, userId: string, sessionId: string, reason: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select user_id from sessions where id = $1`, [sessionId]);
      if (!rows[0]) throw new NotFoundException('session not found');
      // A session can only be revoked by the user it belongs to — this is
      // self-service sign-out, not an admin-impersonation tool (that would
      // be a separate, RBAC-gated feature).
      if (rows[0].user_id !== userId) throw new ForbiddenException('cannot revoke another user\'s session');

      const { rows: updated } = await client.query(
        `update sessions set revoked_at = now(), revoked_reason = $2 where id = $1 returning *`,
        [sessionId, reason],
      );
      return updated[0];
    });
  }

  async revokeAllOthers(tenantId: string, userId: string, currentSessionId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update sessions set revoked_at = now(), revoked_reason = 'signed out from another session'
         where tenant_id = $1 and user_id = $2 and id != $3 and revoked_at is null
         returning id`,
        [tenantId, userId, currentSessionId],
      );
      return { revokedCount: rows.length };
    });
  }
}
