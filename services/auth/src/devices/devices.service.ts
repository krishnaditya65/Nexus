import { Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash, randomInt, randomUUID } from 'crypto';
import * as bcrypt from 'bcryptjs';
import { withTenant } from '../db/pool';

const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const NOTIFICATIONS_URL = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
const INTERNAL_SECRET = process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret';

function hashDeviceId(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex');
}

/**
 * Device fingerprinting + "new device" login challenge (docs/FEATURES.md
 * §11.1) — see 013_device_fingerprinting.sql's docblock for the
 * "persistent client-generated id, not passive fingerprinting" design.
 * A brand-new device (or a login with no device id at all — treated the
 * same as unknown, so the check can't be trivially bypassed by omitting
 * the header) gets a 6-digit email code to confirm before it's trusted;
 * once confirmed, that device is remembered for this user and future
 * logins from it skip the challenge.
 */
@Injectable()
export class DevicesService {
  async isKnownDevice(tenantId: string, userId: string, deviceId: string | undefined): Promise<boolean> {
    if (!deviceId) return false;
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select 1 from known_devices where user_id = $1 and device_id_hash = $2`, [
        userId,
        hashDeviceId(deviceId),
      ]);
      return rows.length > 0;
    });
  }

  async registerDevice(tenantId: string, userId: string, deviceId: string) {
    await withTenant(tenantId, (client) =>
      client.query(
        `insert into known_devices (tenant_id, user_id, device_id_hash)
         values ($1, $2, $3)
         on conflict (user_id, device_id_hash) do update set last_seen_at = now()`,
        [tenantId, userId, hashDeviceId(deviceId)],
      ),
    );
  }

  async listKnownDevices(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, first_seen_at, last_seen_at from known_devices where user_id = $1 order by last_seen_at desc`,
        [userId],
      );
      return rows;
    });
  }

  async forgetDevice(tenantId: string, userId: string, id: string) {
    await withTenant(tenantId, (client) =>
      client.query(`delete from known_devices where id = $1 and user_id = $2`, [id, userId]),
    );
  }

  /** Issues an opaque challenge id (same "not a real JWT" reasoning as
   *  MfaService.createChallenge) and emails a 6-digit code — reuses
   *  services/notifications's EmailService via its internal endpoint,
   *  same cross-service call shape pm's SubscriptionsService already
   *  uses for digest emails. */
  async createChallenge(tenantId: string, userId: string, deviceId: string, email: string): Promise<{ challengeId: string; expiresIn: number }> {
    const code = randomInt(100000, 999999).toString();
    const codeHash = await bcrypt.hash(code, 10);
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);

    await withTenant(tenantId, (client) =>
      client.query(
        `insert into device_challenges (id, tenant_id, user_id, device_id_hash, code_hash, expires_at)
         values ($1, $2, $3, $4, $5, $6)`,
        [challengeId, tenantId, userId, hashDeviceId(deviceId), codeHash, expiresAt],
      ),
    );

    try {
      await fetch(`${NOTIFICATIONS_URL}/internal/email/send`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-internal-secret': INTERNAL_SECRET },
        body: JSON.stringify({
          tenantId,
          userId,
          subject: 'Confirm this new device',
          body: `A sign-in from a device we haven't seen before needs confirming. Your code: ${code} (expires in 10 minutes). If this wasn't you, change your password immediately.`,
          category: 'new_device_challenge',
        }),
      });
    } catch {
      // A failed email send doesn't fail the challenge issuance itself —
      // same non-fatal-notification pattern as automations.service's
      // notify() and pm's SubscriptionsService.sendDigestEmail. The user
      // simply won't receive the code and the challenge will expire
      // unconfirmed; that fails CLOSED (no access granted), the safe
      // direction for a failure in a security check.
    }

    return { challengeId, expiresIn: CHALLENGE_TTL_MS / 1000 };
  }

  /** Verifies the code, consumes the challenge (delete-and-return, so it
   *  can never be replayed), registers the device as known, and returns
   *  the userId to issue a real access token for. */
  async verifyChallenge(tenantId: string, challengeId: string, code: string): Promise<string> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `delete from device_challenges where id = $1 and tenant_id = $2 and expires_at > now()
         returning user_id, device_id_hash, code_hash`,
        [challengeId, tenantId],
      );
      const challenge = rows[0];
      if (!challenge) throw new UnauthorizedException('challenge expired or not found');

      const ok = await bcrypt.compare(code, challenge.code_hash);
      if (!ok) throw new UnauthorizedException('incorrect code');

      await client.query(
        `insert into known_devices (tenant_id, user_id, device_id_hash)
         values ($1, $2, $3)
         on conflict (user_id, device_id_hash) do update set last_seen_at = now()`,
        [tenantId, challenge.user_id, challenge.device_id_hash],
      );

      return challenge.user_id;
    });
  }
}
