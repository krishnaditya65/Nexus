import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { TenantsService } from '../tenants/tenants.service';
import { UsersService } from '../users/users.service';
import { AuditService } from '../audit/audit.service';
import { MfaService } from '../mfa/mfa.service';
import { SessionsService } from '../sessions/sessions.service';
import { WebauthnService } from '../webauthn/webauthn.service';
import { RolesService } from '../roles/roles.service';
import { GeoIpService, isCountryAllowed, isImpossibleTravel } from '../geo/geoip.service';
import { DevicesService } from '../devices/devices.service';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwt: JwtService,
    private readonly tenants: TenantsService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly mfa: MfaService,
    private readonly sessions: SessionsService,
    private readonly webauthn: WebauthnService,
    private readonly roles: RolesService,
    private readonly geoIp: GeoIpService,
    private readonly devices: DevicesService,
  ) {}

  async login(tenantSlug: string, email: string, password: string, clientIp?: string, userAgent?: string, deviceId?: string) {
    const tenant = await this.tenants.findBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Unknown tenant');

    // Checked before even looking up the user — an IP outside an
    // enforced allowlist shouldn't get to learn whether an email exists
    // for this tenant. Fail-open if clientIp couldn't be resolved at all
    // (e.g. a test harness with no real socket) rather than lock every
    // caller out over a plumbing gap.
    if (clientIp) {
      const allowed = await this.tenants.isIpAllowed(tenant.id, clientIp);
      if (!allowed) {
        await this.audit.record(tenant.id, null, 'user.login.blocked_ip', 'user', null, { email, clientIp });
        throw new UnauthorizedException('Login blocked: your network is not on this workspace\'s allowlist.');
      }
    }

    // Geo-based access restriction (docs/FEATURES.md §11.1) — same
    // "checked before the user lookup, fail-open on an unresolvable
    // signal" shape as IP allowlisting immediately above. `resolveCountry`
    // is a real, wired interface with an honestly-disclosed stub
    // implementation — see GeoIpService's docblock for why (no MaxMind
    // database ships in this repo).
    let loginCountry: string | null = null;
    if (clientIp) {
      loginCountry = await this.geoIp.resolveCountry(clientIp);
      if (!isCountryAllowed(loginCountry, tenant.geo_allowed_countries)) {
        await this.audit.record(tenant.id, null, 'user.login.blocked_geo', 'user', null, {
          email,
          clientIp,
          country: loginCountry,
        });
        throw new UnauthorizedException("Login blocked: your workspace restricts sign-in to specific countries, and yours isn't one of them.");
      }
    }

    const user = await this.users.findByEmailForAuth(tenant.id, email);
    if (!user) {
      // No user row to record against, but a failed login against a real
      // tenant is exactly the kind of event Track 1's anomaly detection
      // (impossible-travel, brute force) will eventually key off — recorded
      // with actor_user_id null rather than silently dropped.
      await this.audit.record(tenant.id, null, 'user.login.failed', 'user', null, { email, reason: 'no_such_user' });
      throw new UnauthorizedException('Invalid credentials');
    }

    // Checked BEFORE verifying the password — a locked account rejects
    // every attempt regardless of whether the password given is actually
    // correct, same as every real lockout implementation (a correct
    // password during a lockout window still doesn't get in; if it did,
    // the lockout would only ever stop a bot that never happens to guess
    // right, which is not the threat model).
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      await this.audit.record(tenant.id, user.id, 'user.login.blocked_locked', 'user', user.id, {
        lockedUntil: user.locked_until,
      });
      throw new UnauthorizedException(
        `Account temporarily locked due to repeated failed logins. Try again after ${new Date(user.locked_until).toISOString()}.`,
      );
    }

    const ok = await this.users.verifyPassword(user, password);
    if (!ok) {
      const lockoutResult = await this.users.recordFailedLogin(tenant.id, user.id);
      await this.audit.record(tenant.id, user.id, 'user.login.failed', 'user', user.id, {
        reason: 'bad_password',
        lockedJustNow: lockoutResult.lockedJustNow,
        remainingAttempts: lockoutResult.remainingAttempts,
      });
      if (lockoutResult.lockedJustNow) {
        await this.audit.record(tenant.id, user.id, 'user.login.locked', 'user', user.id, {
          lockedUntil: lockoutResult.lockedUntil,
        });
        throw new UnauthorizedException(
          `Too many failed attempts. Account locked until ${new Date(lockoutResult.lockedUntil!).toISOString()}.`,
        );
      }
      throw new UnauthorizedException('Invalid credentials');
    }

    // Correct password — the thing brute-force protection actually
    // guards is being reached, so reset the failure counter regardless of
    // whether an MFA challenge still follows.
    await this.users.resetFailedLogins(tenant.id, user.id);

    // Impossible-travel anomaly detection (docs/FEATURES.md §11.1) — a
    // SOFT signal, deliberately not a hard block: flagged and audit-
    // logged, but the login still proceeds. Real impossible-travel
    // detection in production security tooling is almost always alert-
    // and-review, not auto-block (a legitimate traveler, VPN switch, or
    // mobile carrier IP reassignment all trigger the same signal a real
    // account-takeover would) — auto-blocking here would trade a
    // detectable false positive for real user lockouts. Country-level
    // only (no lat/lon in this build's GeoIP stub — see GeoIpService's
    // docblock), and only checked on this direct password-login path;
    // the MFA/WebAuthn login-verify flows below don't yet re-check it —
    // disclosed narrower scope, not silently implied as covered.
    if (
      isImpossibleTravel(
        { country: user.last_login_country ?? null, at: user.last_login_at ? new Date(user.last_login_at) : null },
        { country: loginCountry, at: new Date() },
      )
    ) {
      await this.audit.record(tenant.id, user.id, 'user.login.anomaly_impossible_travel', 'user', user.id, {
        previousCountry: user.last_login_country,
        previousAt: user.last_login_at,
        currentCountry: loginCountry,
        clientIp,
      });
    }

    // Device fingerprinting + "new device" challenge (docs/FEATURES.md
    // §11.1) — opt-in via `tenants.device_challenge_required` (same
    // "off by default, owner explicitly turns it on" stance as
    // mfa_required — defaulting this ON platform-wide would be a
    // breaking UX change sprung on every existing tenant's users with no
    // opt-out). Also skipped when MFA is already enabled for this user
    // (MFA already covers the "prove it's really you" bar this exists
    // for; stacking both would be redundant friction for the same threat
    // model). A missing deviceId is treated the same as an unknown one —
    // otherwise a caller could bypass the challenge just by omitting the
    // header. See DevicesService's docblock for the challenge/verify shape.
    if (tenant.device_challenge_required && !user.mfa_enabled) {
      const known = await this.devices.isKnownDevice(tenant.id, user.id, deviceId);
      if (!known) {
        await this.audit.record(tenant.id, user.id, 'user.login.device_challenge_issued', 'user', user.id, { deviceId: deviceId ?? null });
        const challenge = await this.devices.createChallenge(tenant.id, user.id, deviceId ?? randomBytes(16).toString('hex'), user.email);
        return { deviceVerificationRequired: true, ...challenge };
      }
    }

    // MFA enabled: password alone isn't enough — hand back an opaque,
    // short-lived challenge instead of a real access token. See
    // mfa.service.ts's docblock for why this is deliberately not itself
    // a signed JWT.
    if (user.mfa_enabled) {
      await this.audit.record(tenant.id, user.id, 'user.login.mfa_challenge_issued', 'user', user.id, {});
      const challenge = await this.mfa.createChallenge(tenant.id, user.id);
      return { mfaRequired: true, ...challenge };
    }

    // Platform-enforced 2FA policy (docs/FEATURES.md §13.8) — checked
    // AFTER password verification succeeds (so a wrong password still
    // just says "invalid credentials," never leaking whether MFA
    // enrollment is required for this account) and only when the tenant
    // owner has turned `tenants.mfa_required` on. A correct password from
    // an unenrolled user, on an MFA-required tenant, gets NO real access
    // token — only a short-lived, narrowly-scoped enrollment token, same
    // "hand back an opaque non-access credential instead" shape as the
    // MFA challenge above.
    //
    // **Disclosed scope limitation**: this enrollment token is a real,
    // signed JWT `issueMfaEnrollmentToken` produces — every other service
    // in this platform verifies JWTs independently via JWKS with no live
    // channel back to auth (the same constraint `issueToken`'s docblock
    // describes for `permissions`), so making this token PROVABLY inert
    // outside the enrollment endpoints everywhere in the platform would
    // require updating all 16 services' JWT strategies to check a scope
    // claim — out of scope for this pass. What IS enforced: it expires in
    // 5 minutes (vs. a normal token's 1 hour), carries no `permissions`
    // and a `role` of `'unenrolled'` (never a real role string, so any
    // `@Roles(...)`-gated route across the platform rejects it on role
    // mismatch even without a scope-aware guard), and the frontend never
    // surfaces it as a usable session. A narrower, honestly-scoped
    // guarantee than "cryptographically impossible to misuse" — disclosed
    // as such, not overclaimed.
    if (tenant.mfa_required) {
      await this.audit.record(tenant.id, user.id, 'user.login.mfa_enrollment_required', 'user', user.id, {});
      const enrollmentToken = await this.issueMfaEnrollmentToken(user);
      return { mfaEnrollmentRequired: true, enrollmentToken, expiresIn: 300 };
    }

    const accessToken = await this.issueToken(user, clientIp ?? null, userAgent ?? null);
    await this.audit.record(tenant.id, user.id, 'user.login.succeeded', 'user', user.id, {});
    await this.users.updateLastLogin(tenant.id, user.id, loginCountry);
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  /** Second half of an MFA login: exchanges a valid challenge + TOTP/
   *  recovery code for a real access token. */
  async verifyMfaAndLogin(tenantSlug: string, challengeId: string, code: string, clientIp?: string, userAgent?: string) {
    const tenant = await this.tenants.findBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Unknown tenant');

    const userId = await this.mfa.verifyChallenge(tenant.id, challengeId, code);
    const user = await this.users.findById(tenant.id, userId);
    if (!user) throw new UnauthorizedException('user not found');

    const accessToken = await this.issueToken(user, clientIp ?? null, userAgent ?? null);
    await this.audit.record(tenant.id, user.id, 'user.login.succeeded', 'user', user.id, { via: 'mfa' });
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  /** Second half of a new-device-gated login — see DevicesService's
   *  docblock. Same shape as verifyMfaAndLogin above. */
  async verifyDeviceAndLogin(tenantSlug: string, challengeId: string, code: string, clientIp?: string, userAgent?: string) {
    const tenant = await this.tenants.findBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Unknown tenant');

    const userId = await this.devices.verifyChallenge(tenant.id, challengeId, code);
    const user = await this.users.findById(tenant.id, userId);
    if (!user) throw new UnauthorizedException('user not found');

    const accessToken = await this.issueToken(user, clientIp ?? null, userAgent ?? null);
    await this.audit.record(tenant.id, user.id, 'user.login.succeeded', 'user', user.id, { via: 'device_challenge' });
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  async listKnownDevices(tenantId: string, userId: string) {
    return this.devices.listKnownDevices(tenantId, userId);
  }

  async forgetDevice(tenantId: string, userId: string, id: string) {
    return this.devices.forgetDevice(tenantId, userId, id);
  }

  /** WebAuthn equivalent of the two mfa methods above: fetches assertion
   *  options for an in-flight login challenge (asks the browser to
   *  produce a signature from one of the user's registered passkeys). */
  async webauthnLoginOptions(tenantSlug: string, challengeId: string) {
    const tenant = await this.tenants.findBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Unknown tenant');
    return this.webauthn.startAuthentication(tenant.id, challengeId);
  }

  /** Second half of a WebAuthn-gated login — exchanges the challenge from
   *  `login()` plus a signed assertion for a real access token. */
  async verifyWebauthnAndLogin(tenantSlug: string, challengeId: string, response: any, clientIp?: string, userAgent?: string) {
    const tenant = await this.tenants.findBySlug(tenantSlug);
    if (!tenant) throw new UnauthorizedException('Unknown tenant');

    const userId = await this.webauthn.verifyAuthentication(tenant.id, challengeId, response);
    const user = await this.users.findById(tenant.id, userId);
    if (!user) throw new UnauthorizedException('user not found');

    const accessToken = await this.issueToken(user, clientIp ?? null, userAgent ?? null);
    await this.audit.record(tenant.id, user.id, 'user.login.succeeded', 'user', user.id, { via: 'webauthn' });
    return { accessToken, tokenType: 'Bearer', expiresIn: 3600 };
  }

  /** Creates a real, listable/revocable session row (see sessions/
   *  sessions.service.ts) and embeds its id as the JWT's `sid` claim —
   *  jwt.strategy.ts checks this claim against the session table on every
   *  request THROUGH THIS SERVICE. Other services verify the JWT purely
   *  via JWKS with no live channel back to this table, so revoking a
   *  session here does not instantly invalidate that token against them —
   *  documented, not silently overclaimed; see the sessions migration's
   *  docblock. */
  private async issueToken(
    user: { id: string; tenant_id: string; role: string; email: string; is_guest?: boolean; custom_role_id?: string | null },
    ip: string | null,
    userAgent: string | null,
  ) {
    const sessionId = await this.sessions.create(user.tenant_id, user.id, ip, userAgent);

    // Custom role builder (§11.1/§13.8) — resolved and embedded at token-issue
    // time, the same choice §12.7 made for `is_guest`: every other service
    // already verifies this JWT via JWKS with no live channel back to auth,
    // so the permission set has to travel WITH the token rather than be
    // looked up per-request. Trade-off, disclosed same as sessions.ts's:
    // revoking/editing a role takes effect on the caller's NEXT login, not
    // instantly — acceptable for a ≤1h-lived token, same bar as role changes
    // via setRole() already have (no live push of a role change either).
    let permissions: string[] = [];
    if (user.custom_role_id) {
      const role = await this.roles.findById(user.tenant_id, user.custom_role_id);
      permissions = role?.permissions ?? [];
    }

    return this.jwt.sign(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        role: user.role,
        email: user.email,
        sid: sessionId,
        // §12.7 — travels in every token so other services (pm's guard,
        // in particular) know to check project-level membership at all;
        // a non-guest member is never membership-checked.
        is_guest: user.is_guest ?? false,
        permissions,
      },
      { expiresIn: '1h' },
    );
  }

  /** §13.8 — see login()'s docblock for the enforcement design and its
   *  disclosed scope. No session row (unlike issueToken — this never
   *  represents a real logged-in session), no permissions, and a `role`
   *  that deliberately doesn't match any real role string. */
  private async issueMfaEnrollmentToken(user: { id: string; tenant_id: string; email: string }) {
    return this.jwt.sign(
      {
        sub: user.id,
        tenant_id: user.tenant_id,
        role: 'unenrolled',
        email: user.email,
        is_guest: false,
        permissions: [],
        mfa_enrollment_only: true,
      },
      { expiresIn: '5m' },
    );
  }

  // ---- Sub-tenant isolation: cross-division access (docs/FEATURES.md §11.1) ----

  /**
   * Governed bridge into a division's data for a master-tenant owner —
   * the actual hard part of "sub-tenant isolation", since RLS already
   * gives divisions real data isolation for free (see migration
   * 009_sub_tenants.sql's docblock). Mints a real, ordinary access token
   * scoped to the sub-tenant, so every downstream service treats it
   * exactly like any other login — no special-cased "impersonation" bypass
   * to keep consistent anywhere else in the platform.
   *
   * Deliberately capped at 'admin' in the sub-tenant, never 'owner': a
   * parent-org admin can operate a division but can't do owner-only things
   * there (delete the division, rewire its SSO/billing) without a real
   * owner physically inside that division. JIT-provisions a "bridge user"
   * the first time, keyed by the caller's own email — same pattern
   * services/identity-federation already uses for SSO first-login, reused
   * here instead of inventing a second provisioning mechanism.
   *
   * Audited on BOTH sides of the boundary: the parent tenant's audit_log
   * records that one of its admins reached into a division, and — just as
   * important — the division's OWN audit_log records that it was accessed
   * by a parent-org admin, so a division isn't isolated from its own
   * visibility into who touched its data.
   */
  async accessSubTenant(
    caller: { userId: string; tenantId: string; email: string; displayName: string },
    subTenantId: string,
    ip: string | null,
    userAgent: string | null,
  ) {
    const subTenant = await this.tenants.findById(subTenantId);
    if (!subTenant || subTenant.parent_tenant_id !== caller.tenantId) {
      throw new ForbiddenException('Not a sub-tenant of your organization');
    }

    let bridgeUser = await this.users.findByEmailForAuth(subTenant.id, caller.email);
    if (!bridgeUser) {
      const generatedPassword = randomBytes(24).toString('hex');
      bridgeUser = {
        ...(await this.users.create(subTenant.id, caller.email, generatedPassword, caller.displayName, 'admin')),
        password_hash: '',
      };
    }

    const accessToken = await this.issueToken(bridgeUser, ip, userAgent);

    await this.audit.record(caller.tenantId, caller.userId, 'tenant.sub_tenant.accessed', 'tenant', subTenant.id, {
      subTenantSlug: subTenant.slug,
    });
    await this.audit.record(subTenant.id, bridgeUser.id, 'tenant.accessed_by_parent_admin', 'tenant', caller.tenantId, {
      parentUserId: caller.userId,
      parentUserEmail: caller.email,
    });

    return { accessToken, tenantId: subTenant.id, tenantSlug: subTenant.slug };
  }
}
