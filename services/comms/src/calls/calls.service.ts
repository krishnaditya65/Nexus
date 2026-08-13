import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { writeRecording, readRecording } from './storage';

const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

/**
 * WebRTC video/audio calls (docs/FEATURES.md §11.6) — see
 * 003_calls.sql's docblock for the mesh-topology/signaling-relay-not-
 * media-server architecture. This service is the call bookkeeping half;
 * calls.gateway.ts (extending the existing chat Socket.IO gateway) is the
 * actual signaling relay.
 */
@Injectable()
export class CallsService {
  async startCall(tenantId: string, startedByUserId: string, channelId: string | null, ticketKey: string | null) {
    if (!channelId && !ticketKey) {
      throw new BadRequestException('A call needs either a channelId or a ticketKey');
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into calls (tenant_id, channel_id, ticket_key, started_by_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, channelId, ticketKey, startedByUserId],
      );
      const call = rows[0];
      await client.query(
        `insert into call_participants (call_id, tenant_id, user_id) values ($1, $2, $3)`,
        [call.id, tenantId, startedByUserId],
      );
      return call;
    });
  }

  async joinCall(tenantId: string, callId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const callRes = await client.query(`select * from calls where id = $1 and ended_at is null`, [callId]);
      if (!callRes.rows[0]) throw new NotFoundException('Call not found or already ended');
      await client.query(
        `insert into call_participants (call_id, tenant_id, user_id) values ($1, $2, $3)`,
        [callId, tenantId, userId],
      );
      return callRes.rows[0];
    });
  }

  async leaveCall(tenantId: string, callId: string, userId: string) {
    await withTenant(tenantId, (client) =>
      client.query(
        `update call_participants set left_at = now()
         where call_id = $1 and user_id = $2 and left_at is null`,
        [callId, userId],
      ),
    );
  }

  async endCall(tenantId: string, callId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update calls set ended_at = now() where id = $1 and ended_at is null returning *`,
        [callId],
      );
      await client.query(`update call_participants set left_at = now() where call_id = $1 and left_at is null`, [callId]);
      return rows[0] ?? null;
    });
  }

  async get(tenantId: string, callId: string) {
    return withTenant(tenantId, async (client) => {
      const callRes = await client.query(`select * from calls where id = $1`, [callId]);
      if (!callRes.rows[0]) throw new NotFoundException('Call not found');
      const participants = await client.query(
        `select user_id, joined_at, left_at from call_participants where call_id = $1 order by joined_at`,
        [callId],
      );
      const recordings = await client.query(
        `select id, uploaded_by_user_id, duration_seconds, uploaded_at from call_recordings where call_id = $1 order by uploaded_at desc`,
        [callId],
      );
      return { ...callRes.rows[0], participants: participants.rows, recordings: recordings.rows };
    });
  }

  /** Client-side-recorded blob, uploaded after the call — see
   *  storage.ts's docblock for why there's no server-side media pipeline
   *  to hook a recording into (mesh topology, no SFU). */
  async uploadRecording(
    tenantId: string,
    callId: string,
    uploadedByUserId: string,
    filename: string,
    data: Buffer,
    durationSeconds: number | null,
  ) {
    return withTenant(tenantId, async (client) => {
      const callRes = await client.query(`select id from calls where id = $1`, [callId]);
      if (!callRes.rows[0]) throw new NotFoundException('Call not found');
      const path = writeRecording(tenantId, callId, filename, data);
      const { rows } = await client.query(
        `insert into call_recordings (tenant_id, call_id, storage_path, uploaded_by_user_id, duration_seconds)
         values ($1, $2, $3, $4, $5) returning id, uploaded_at`,
        [tenantId, callId, path, uploadedByUserId, durationSeconds],
      );
      return rows[0];
    });
  }

  async downloadRecording(tenantId: string, recordingId: string): Promise<{ data: Buffer; filename: string } | null> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select storage_path from call_recordings where id = $1`, [recordingId]);
      if (!rows[0]) return null;
      const data = readRecording(rows[0].storage_path);
      if (!data) return null;
      return { data, filename: rows[0].storage_path.split('/').pop() ?? 'recording.webm' };
    });
  }

  /** Call-from-ticket paging (docs/FEATURES.md §11.6) — pages a list of
   *  users (typically an Incident's assignee/on-call chain, resolved by
   *  the caller) that a call is starting, via services/notifications's
   *  existing push-send internal endpoint. Distinct from that service's
   *  pre-existing paging: this is "a LIVE call is starting, join now,"
   *  not a static alert — the notification body carries the callId so
   *  the client can deep-link straight into joining. */
  async pageForCall(tenantId: string, callId: string, ticketKey: string, userIds: string[]) {
    await Promise.all(
      userIds.map((userId) =>
        fetch(`${NOTIFICATIONS_URL}/internal/notifications/send`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
          body: JSON.stringify({
            tenantId,
            userId,
            title: `Call started on ${ticketKey}`,
            body: `Join the call in progress — callId ${callId}`,
            category: 'call_page',
          }),
        }).catch(() => {
          // Same non-fatal-notification-failure pattern as every other
          // internal-notification caller in this build (automations,
          // pm's subscriptions) — one failed page never fails the call
          // itself, which has already started.
        }),
      ),
    );
    return { paged: userIds.length };
  }
}
