import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { withTenant } from '../db/pool';

const REGISTRATION_CHALLENGE_TTL_MS = 5 * 60 * 1000;

// A real deployment would serve the web app from a fixed production
// origin/hostname; this repo's dev/test deployment runs the web app on
// localhost:3000, so that's the default. Both are overridable so a real
// deployment doesn't have to fork this code — WebAuthn hard-fails (by
// design, per spec) if these don't match the browser's actual origin.
const RP_NAME = 'Nexus';
const RP_ID = process.env.WEBAUTHN_RP_ID ?? 'localhost';
const RP_ORIGIN = process.env.WEBAUTHN_RP_ORIGIN ?? 'http://localhost:3000';

/**
 * WebAuthn/FIDO2 (docs/FEATURES.md §11.1) — phishing-resistant MFA via
 * platform authenticators (Touch ID, Windows Hello) or roaming security
 * keys, alongside the existing TOTP flow (see mfa/mfa.service.ts). A user
 * can register multiple credentials; any one of them satisfies the
 * second factor at login. Registering a credential also flips
 * users.mfa_enabled on if it wasn't already (a user who only ever sets
 * up a passkey and never TOTP still gets MFA-gated logins) — see
 * finishRegistration.
 */
@Injectable()
export class WebauthnService {
  // --- Registration (already-authenticated user, Settings > Security) ---

  async startRegistration(tenantId: string, userId: string, email: string) {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(
        `select credential_id from webauthn_credentials where tenant_id = $1 and user_id = $2`,
        [tenantId, userId],
      );

      const options = await generateRegistrationOptions({
        rpName: RP_NAME,
        rpID: RP_ID,
        userName: email,
        attestationType: 'none',
        excludeCredentials: existing.rows.map((r) => ({ id: r.credential_id })),
        authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      });

      // Any prior unfinished registration ceremony for this user is
      // superseded — only one can be "in flight" at a time.
      await client.query(`delete from webauthn_registration_challenges where tenant_id = $1 and user_id = $2`, [
        tenantId,
        userId,
      ]);
      await client.query(
        `insert into webauthn_registration_challenges (id, tenant_id, user_id, challenge, expires_at)
         values ($1, $2, $3, $4, $5)`,
        [randomUUID(), tenantId, userId, options.challenge, new Date(Date.now() + REGISTRATION_CHALLENGE_TTL_MS)],
      );

      return options;
    });
  }

  async finishRegistration(tenantId: string, userId: string, response: any, nickname?: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `delete from webauthn_registration_challenges
         where tenant_id = $1 and user_id = $2 and expires_at > now()
         returning challenge`,
        [tenantId, userId],
      );
      const expectedChallenge = rows[0]?.challenge;
      if (!expectedChallenge) throw new BadRequestException('registration ceremony expired or not started');

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response,
          expectedChallenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
        });
      } catch (err: any) {
        throw new BadRequestException(`registration verification failed: ${err.message}`);
      }
      if (!verification.verified || !verification.registrationInfo) {
        throw new BadRequestException('registration verification failed');
      }

      const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
      await client.query(
        `insert into webauthn_credentials
           (id, tenant_id, user_id, credential_id, public_key, counter, device_type, backed_up, transports, nickname)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [
          randomUUID(),
          tenantId,
          userId,
          credential.id,
          Buffer.from(credential.publicKey).toString('base64url'),
          credential.counter,
          credentialDeviceType,
          credentialBackedUp,
          credential.transports ?? [],
          nickname ?? null,
        ],
      );

      // A passkey is a full second factor on its own — a user who enrolls
      // one without ever touching TOTP should still be MFA-gated at login.
      await client.query(`update users set mfa_enabled = true where id = $1 and mfa_enabled = false`, [userId]);

      return { status: 'registered' };
    });
  }

  async listCredentials(tenantId: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, nickname, device_type, backed_up, transports, created_at, last_used_at
         from webauthn_credentials where tenant_id = $1 and user_id = $2 order by created_at desc`,
        [tenantId, userId],
      );
      return rows;
    });
  }

  async deleteCredential(tenantId: string, userId: string, credentialId: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(
        `delete from webauthn_credentials where id = $1 and tenant_id = $2 and user_id = $3`,
        [credentialId, tenantId, userId],
      );
      if (!rowCount) throw new BadRequestException('credential not found');
      return { status: 'deleted' };
    });
  }

  // --- Authentication (login-time second factor) ---
  // Shares the mfa_challenges row a password-verified login already
  // created (see mfa/mfa.service.ts's createChallenge) — same challengeId,
  // just populating its webauthn_challenge column, rather than a second
  // parallel challenge concept the client would have to juggle.

  async startAuthentication(tenantId: string, challengeId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select user_id from mfa_challenges where id = $1 and tenant_id = $2 and expires_at > now()`,
        [challengeId, tenantId],
      );
      const userId = rows[0]?.user_id;
      if (!userId) throw new UnauthorizedException('challenge expired or not found');

      const creds = await client.query(
        `select credential_id, transports from webauthn_credentials where tenant_id = $1 and user_id = $2`,
        [tenantId, userId],
      );
      if (creds.rows.length === 0) {
        throw new BadRequestException('no passkeys registered for this account');
      }

      const options = await generateAuthenticationOptions({
        rpID: RP_ID,
        userVerification: 'preferred',
        allowCredentials: creds.rows.map((r) => ({ id: r.credential_id, transports: r.transports })),
      });

      await client.query(`update mfa_challenges set webauthn_challenge = $1 where id = $2`, [
        options.challenge,
        challengeId,
      ]);

      return options;
    });
  }

  /** Verifies the assertion and consumes the shared challenge row, same
   *  single-use-by-delete semantics as TOTP's verifyChallenge. Returns
   *  the userId for AuthService to issue a real access token against. */
  async verifyAuthentication(tenantId: string, challengeId: string, response: any): Promise<string> {
    return withTenant(tenantId, async (client) => {
      const challengeRes = await client.query(
        `delete from mfa_challenges
         where id = $1 and tenant_id = $2 and expires_at > now() and webauthn_challenge is not null
         returning user_id, webauthn_challenge`,
        [challengeId, tenantId],
      );
      const row = challengeRes.rows[0];
      if (!row) throw new UnauthorizedException('challenge expired, not found, or authentication not started');

      const credRes = await client.query(
        `select id, credential_id, public_key, counter, transports from webauthn_credentials
         where tenant_id = $1 and user_id = $2 and credential_id = $3`,
        [tenantId, row.user_id, response?.id],
      );
      const cred = credRes.rows[0];
      if (!cred) throw new UnauthorizedException('unrecognized credential');

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
          response,
          expectedChallenge: row.webauthn_challenge,
          expectedOrigin: RP_ORIGIN,
          expectedRPID: RP_ID,
          credential: {
            id: cred.credential_id,
            publicKey: Buffer.from(cred.public_key, 'base64url'),
            counter: Number(cred.counter),
            transports: cred.transports,
          },
        });
      } catch (err: any) {
        throw new UnauthorizedException(`authentication verification failed: ${err.message}`);
      }
      if (!verification.verified) throw new UnauthorizedException('authentication verification failed');

      // Counter must strictly increase — a replayed/cloned authenticator
      // would replay an old (lower-or-equal) counter value. This is the
      // spec's primary defense against cloned security keys.
      await client.query(`update webauthn_credentials set counter = $1, last_used_at = now() where id = $2`, [
        verification.authenticationInfo.newCounter,
        cred.id,
      ]);

      return row.user_id;
    });
  }
}
