import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { withTenant } from '../db/pool';

export interface User {
  id: string;
  tenant_id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  mfa_enabled?: boolean;
  failed_login_count?: number;
  locked_until?: string | null;
  lockout_count?: number;
  is_guest?: boolean;
  custom_role_id?: string | null;
  last_login_country?: string | null;
  last_login_at?: string | null;
}

// Lockout duration grows across separate lockout EPISODES (lockout_count
// never resets), not within one — a user locked out for the 4th time gets
// a longer cooldown than a first-time offender. Capped at the last entry
// so this doesn't grow unboundedly for a sustained attack.
const LOCKOUT_BACKOFF_MINUTES = [1, 5, 15, 30, 60];
const FAILED_LOGIN_THRESHOLD = 5;

// Pulled out as a standalone, exported, pure function — the actual
// decision logic security review/tests care about — so it's unit-testable
// without a database. See users.service.spec.ts.
export function backoffMinutesFor(lockoutCount: number): number {
  return LOCKOUT_BACKOFF_MINUTES[Math.min(lockoutCount, LOCKOUT_BACKOFF_MINUTES.length - 1)];
}

@Injectable()
export class UsersService {
  async create(
    tenantId: string,
    email: string,
    password: string,
    displayName: string,
    role: 'owner' | 'admin' | 'member' = 'member',
    isGuest: boolean = false,
  ): Promise<User> {
    const hash = await bcrypt.hash(password, 12);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query<User>(
        `insert into users (tenant_id, email, password_hash, display_name, role, is_guest)
         values ($1, $2, $3, $4, $5, $6)
         returning id, tenant_id, email, display_name, role, created_at, is_guest`,
        [tenantId, email, hash, displayName, role, isGuest],
      );
      return rows[0];
    });
  }

  /** Login path: tenant is not yet known from a JWT, so this scopes by tenantId
   *  resolved from the request's tenant slug — the one place a caller supplies
   *  tenant context directly rather than deriving it from a verified token. */
  async findByEmailForAuth(
    tenantId: string,
    email: string,
  ): Promise<(User & { password_hash: string }) | null> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from users where tenant_id = $1 and email = $2`,
        [tenantId, email],
      );
      return rows[0] ?? null;
    });
  }

  async verifyPassword(user: { password_hash: string }, password: string) {
    return bcrypt.compare(password, user.password_hash);
  }

  /** Called on every failed password check. Returns whether this failure
   *  just tripped the lockout threshold — AuthService uses that to decide
   *  what to tell the caller and what to audit-log. Resets
   *  failed_login_count back to 0 the moment a lockout is applied (not
   *  left at the threshold), so the count reflects "failures since the
   *  last lockout episode started", not a monotonically growing number. */
  async recordFailedLogin(
    tenantId: string,
    userId: string,
  ): Promise<{ lockedJustNow: boolean; lockedUntil: string | null; remainingAttempts: number }> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update users set failed_login_count = failed_login_count + 1 where id = $1
         returning failed_login_count, lockout_count`,
        [userId],
      );
      const { failed_login_count, lockout_count } = rows[0];
      if (failed_login_count < FAILED_LOGIN_THRESHOLD) {
        return { lockedJustNow: false, lockedUntil: null, remainingAttempts: FAILED_LOGIN_THRESHOLD - failed_login_count };
      }
      const minutes = backoffMinutesFor(lockout_count);
      const { rows: lockedRows } = await client.query(
        `update users set locked_until = now() + ($1 || ' minutes')::interval, lockout_count = lockout_count + 1, failed_login_count = 0
         where id = $2 returning locked_until`,
        [minutes, userId],
      );
      return { lockedJustNow: true, lockedUntil: lockedRows[0].locked_until, remainingAttempts: 0 };
    });
  }

  /** Called on a correct password check (independent of whether MFA
   *  follow-up is still needed) — the account being brute-forced is the
   *  password, so a correct guess resets the counter regardless of what
   *  happens next. Does NOT touch lockout_count (that's the backoff
   *  multiplier across separate episodes, not per-attempt state) or
   *  locked_until (a currently-locked account can't reach this path —
   *  AuthService checks locked_until before verifying the password at all). */
  async resetFailedLogins(tenantId: string, userId: string) {
    await withTenant(tenantId, (client) => client.query(`update users set failed_login_count = 0 where id = $1`, [userId]));
  }

  /** Impossible-travel anomaly detection (docs/FEATURES.md §11.1) —
   *  stamped after every successful login (real access token issued),
   *  never on a failed/blocked one, so the comparison AuthService.login()
   *  makes is always against the last GENUINE login, not a rejected
   *  attempt an attacker could use to poison the baseline. */
  async updateLastLogin(tenantId: string, userId: string, country: string | null) {
    await withTenant(tenantId, (client) =>
      client.query(`update users set last_login_country = $1, last_login_at = now() where id = $2`, [country, userId]),
    );
  }

  /** Used by the MFA login-verify step: at that point the caller has
   *  already proven identity via password + a valid challenge, and needs
   *  the full user row (minus the hash) to mint a real access token. */
  async findById(tenantId: string, userId: string): Promise<User | null> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query<User>(
        `select id, tenant_id, email, display_name, role, created_at, is_guest, custom_role_id from users where tenant_id = $1 and id = $2`,
        [tenantId, userId],
      );
      return rows[0] ?? null;
    });
  }

  /** Used by the compliance service's tenant data-export job ("right to
   *  leave") and by admin user-management UI — never returns password_hash. */
  async list(tenantId: string): Promise<User[]> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query<User>(
        `select id, tenant_id, email, display_name, role, created_at, is_guest, custom_role_id
         from users where tenant_id = $1 order by created_at`,
        [tenantId],
      );
      return rows;
    });
  }

  /**
   * Real gap found live wiring up a Permissions settings screen: there
   * was no way to change a user's role after invite/bootstrap at all —
   * `create()` sets it once, and nothing ever updated it again. Deliberately
   * owner-only (not admin — role changes are the one action even an admin
   * shouldn't grant themselves or each other) and blocks a caller from
   * changing their own role, so an owner can't accidentally lock
   * themselves out of the tenant by demoting themselves with no other
   * owner to undo it.
   */
  async setRole(
    tenantId: string,
    targetUserId: string,
    newRole: 'owner' | 'admin' | 'member',
    requestingUserId: string,
  ): Promise<User> {
    if (targetUserId === requestingUserId) {
      throw new ForbiddenException('Cannot change your own role');
    }
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select id from users where id = $1`, [targetUserId]);
      if (!existing.rows[0]) throw new NotFoundException('User not found');
      const { rows } = await client.query<User>(
        `update users set role = $1 where id = $2
         returning id, tenant_id, email, display_name, role, created_at`,
        [newRole, targetUserId],
      );
      return rows[0];
    });
  }

  /** Custom role builder (docs/FEATURES.md §11.1/§13.8) — assigns or clears
   *  (`customRoleId: null`) the one custom role a user holds. Deliberately
   *  does NOT touch `role` (owner/admin/member) at all: a custom role is an
   *  additive grant layered on top, never a replacement, so this can't be
   *  used to quietly turn a 'member' into something that bypasses the
   *  existing owner-only actions RolesGuard already protects (setRole
   *  itself, billing, DR policy, etc. all stay owner/admin-gated exactly as
   *  before). Owner-only, same tier as setRole above — assigning
   *  permissions is as sensitive as assigning the base role. */
  async setCustomRole(tenantId: string, targetUserId: string, customRoleId: string | null): Promise<User> {
    return withTenant(tenantId, async (client) => {
      const existing = await client.query(`select id from users where id = $1`, [targetUserId]);
      if (!existing.rows[0]) throw new NotFoundException('User not found');
      if (customRoleId) {
        const role = await client.query(`select id from roles where id = $1 and tenant_id = $2`, [
          customRoleId,
          tenantId,
        ]);
        if (!role.rows[0]) throw new NotFoundException('Role not found');
      }
      const { rows } = await client.query<User>(
        `update users set custom_role_id = $1 where id = $2
         returning id, tenant_id, email, display_name, role, created_at, is_guest, custom_role_id`,
        [customRoleId, targetUserId],
      );
      return rows[0];
    });
  }
}
