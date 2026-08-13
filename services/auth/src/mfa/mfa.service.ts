import { BadRequestException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as bcrypt from 'bcryptjs';
import { randomBytes, randomUUID } from 'crypto';
import { withTenant } from '../db/pool';

const RECOVERY_CODE_COUNT = 10;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * TOTP-based MFA (docs/FEATURES.md §11.1). The login-challenge token is
 * deliberately NOT a JWT signed by the platform's real RS256 keypair —
 * every other service in this platform trusts any structurally-valid
 * token that keypair signs as a fully authenticated request, with no
 * concept of "this one is mfa-pending, don't honor it yet." Reusing the
 * real signing key for a pre-MFA token would mean a caller who
 * intercepted it could replay it against pm/cicd/etc. as a genuine
 * access token. Instead this is an opaque random challenge id, stored
 * server-side with a short TTL, meaningless anywhere outside this one
 * verify endpoint — the same "don't trust a token shape, trust a
 * server-side lookup" reasoning as api-platform's API keys.
 */
@Injectable()
export class MfaService {
  async status(tenantId: string, userId: string): Promise<{ enabled: boolean }> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select mfa_enabled from users where id = $1`, [userId]);
      return { enabled: rows[0]?.mfa_enabled ?? false };
    });
  }

  /** Step 1 of enrollment: generate a secret, store it UNCONFIRMED
   *  (mfa_enabled stays false) so a half-finished enrollment can't lock
   *  a future login flow into requiring a code the user never actually
   *  confirmed they can generate. */
  async startEnrollment(tenantId: string, userId: string, email: string) {
    const secret = authenticator.generateSecret();
    await withTenant(tenantId, (client) => client.query(`update users set mfa_secret = $1 where id = $2`, [secret, userId]));
    return {
      secret,
      otpauthUrl: authenticator.keyuri(email, 'Nexus', secret),
    };
  }

  /** Step 2: confirm the user's authenticator app actually produces valid
   *  codes for the pending secret before flipping mfa_enabled on.
   *  Recovery codes are generated here and returned exactly once — same
   *  shown-once discipline as api-platform's webhook signing secrets and
   *  the Pipelines Library's secret variable entries. */
  async confirmEnrollment(tenantId: string, userId: string, code: string): Promise<{ recoveryCodes: string[] }> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select mfa_secret from users where id = $1`, [userId]);
      const secret = rows[0]?.mfa_secret;
      if (!secret) throw new BadRequestException('no pending MFA enrollment — call /auth/mfa/enroll first');
      if (!authenticator.check(code, secret)) {
        throw new UnauthorizedException('invalid code');
      }

      await client.query(`update users set mfa_enabled = true where id = $1`, [userId]);
      await client.query(`delete from mfa_recovery_codes where user_id = $1`, [userId]);

      const plaintextCodes: string[] = [];
      for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
        const plain = randomBytes(5).toString('hex'); // 10 hex chars, e.g. "a3f9c1e02b"
        plaintextCodes.push(plain);
        const hash = await bcrypt.hash(plain, 10);
        await client.query(
          `insert into mfa_recovery_codes (tenant_id, user_id, code_hash) values ($1, $2, $3)`,
          [tenantId, userId, hash],
        );
      }
      return { recoveryCodes: plaintextCodes };
    });
  }

  /** Requires re-proving both the password AND a valid code — a hijacked
   *  already-logged-in session shouldn't be able to silently turn MFA
   *  off on its own. */
  async disable(tenantId: string, userId: string, password: string, code: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select password_hash, mfa_secret from users where id = $1`, [userId]);
      const user = rows[0];
      if (!user) throw new BadRequestException('user not found');
      const passwordOk = await bcrypt.compare(password, user.password_hash);
      if (!passwordOk) throw new UnauthorizedException('invalid password');
      if (!user.mfa_secret || !authenticator.check(code, user.mfa_secret)) {
        throw new UnauthorizedException('invalid code');
      }
      await client.query(`update users set mfa_enabled = false, mfa_secret = null where id = $1`, [userId]);
      await client.query(`delete from mfa_recovery_codes where user_id = $1`, [userId]);
      return { status: 'disabled' };
    });
  }

  /** Called by AuthService.login() once the password has checked out but
   *  before a real access token is issued, if the user has MFA enabled. */
  async createChallenge(tenantId: string, userId: string): Promise<{ challengeId: string; expiresIn: number }> {
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
    await withTenant(tenantId, (client) =>
      client.query(
        `insert into mfa_challenges (id, tenant_id, user_id, expires_at) values ($1, $2, $3, $4)`,
        [challengeId, tenantId, userId, expiresAt],
      ),
    );
    return { challengeId, expiresIn: CHALLENGE_TTL_MS / 1000 };
  }

  /** Verifies a login challenge against either a live TOTP code or a
   *  single-use recovery code, consumes the challenge (and the recovery
   *  code, if that's what was used) so neither can be replayed, and
   *  returns the userId to issue a real access token for. */
  async verifyChallenge(tenantId: string, challengeId: string, code: string): Promise<string> {
    return withTenant(tenantId, async (client) => {
      const challengeRes = await client.query(
        `delete from mfa_challenges where id = $1 and tenant_id = $2 and expires_at > now() returning user_id`,
        [challengeId, tenantId],
      );
      const userId = challengeRes.rows[0]?.user_id;
      if (!userId) throw new UnauthorizedException('challenge expired or not found');

      const userRes = await client.query(`select mfa_secret from users where id = $1`, [userId]);
      const secret = userRes.rows[0]?.mfa_secret;
      if (secret && authenticator.check(code, secret)) {
        return userId;
      }

      // Not a valid TOTP code — try consuming it as a recovery code
      // instead. Each stored hash is checked (there's no way to index
      // into bcrypt hashes by plaintext), and the matching row is marked
      // consumed so it can never be reused even if it leaks later.
      const recoveryRes = await client.query(
        `select id, code_hash from mfa_recovery_codes where user_id = $1 and consumed_at is null`,
        [userId],
      );
      for (const row of recoveryRes.rows) {
        if (await bcrypt.compare(code, row.code_hash)) {
          await client.query(`update mfa_recovery_codes set consumed_at = now() where id = $1`, [row.id]);
          return userId;
        }
      }

      throw new UnauthorizedException('invalid code');
    });
  }
}
