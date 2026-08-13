// Runner bearer-token generation/verification — no external hashing
// dependency exists in this service yet (unlike services/auth's bcrypt),
// so this uses Node's built-in scrypt (async, salted, timing-safe compare)
// rather than pull in a new package for one use site.
import { randomBytes, scrypt, timingSafeEqual } from 'crypto';
import { promisify } from 'util';

const scryptAsync = promisify(scrypt) as (password: string, salt: string, keylen: number) => Promise<Buffer>;

export function generateRawSecret(): string {
  return randomBytes(24).toString('base64url');
}

export async function hashSecret(raw: string): Promise<string> {
  const salt = randomBytes(16).toString('hex');
  const derived = await scryptAsync(raw, salt, 64);
  return `${salt}:${derived.toString('hex')}`;
}

export async function verifySecret(raw: string, stored: string): Promise<boolean> {
  const [salt, hashHex] = stored.split(':');
  if (!salt || !hashHex) return false;
  const derived = await scryptAsync(raw, salt, 64);
  const stored_ = Buffer.from(hashHex, 'hex');
  if (derived.length !== stored_.length) return false;
  return timingSafeEqual(derived, stored_);
}

/** A runner's bearer token is `<tenantId>.<runnerId>.<rawSecret>` — the
 *  tenant and runner id are embedded directly in the token itself (not
 *  looked up) so RunnerTokenGuard can `SET LOCAL app.tenant_id` and query
 *  under RLS *before* it has verified anything, the same "identify, then
 *  authenticate" order every bearer-token scheme with row-level tenant
 *  isolation needs — there is no eos-owner-role connection available at
 *  request time to do a cross-tenant lookup first. */
export function encodeToken(tenantId: string, runnerId: string, rawSecret: string): string {
  return `${tenantId}.${runnerId}.${rawSecret}`;
}

export function decodeToken(token: string): { tenantId: string; runnerId: string; rawSecret: string } | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [tenantId, runnerId, rawSecret] = parts;
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRe.test(tenantId) || !uuidRe.test(runnerId) || !rawSecret) return null;
  return { tenantId, runnerId, rawSecret };
}
