import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from 'crypto';

/**
 * Real, working AES-256-GCM envelope encryption — genuinely encrypts and
 * decrypts, not a stub. This is the "platform-managed" tier of BYOK/
 * secrets-management (docs/FEATURES.md §11.1): every plaintext-at-rest
 * secret column this build previously flagged with a 🟡 comment
 * (`services/identity-federation`'s OIDC/SAML client secrets,
 * `services/compliance`'s SIEM export auth tokens) now goes through this
 * before hitting a row.
 *
 * `resolveMasterKey` reads a 32-byte key from `EOS_KMS_MASTER_KEY` (hex-
 * encoded, 64 chars). Same "dev-only-X, disclosed" fallback convention
 * already used everywhere in this codebase (`INTERNAL_SERVICE_SECRET`'s
 * `'dev-only-internal-secret'` default) — a fixed, obviously-not-secret
 * dev key when the env var is unset, so local dev never breaks, logged
 * once so it's never mistaken for a real deployment's key.
 */
const DEV_ONLY_MASTER_KEY_HEX = '0'.repeat(63) + '1'; // 32 bytes of near-zero — deliberately, unmistakably not a real key
let warnedAboutDevKey = false;

export function resolveMasterKey(envValue: string | undefined): Buffer {
  const hex = envValue ?? DEV_ONLY_MASTER_KEY_HEX;
  if (!envValue && !warnedAboutDevKey) {
    // eslint-disable-next-line no-console
    console.warn('[@nexus/kms] EOS_KMS_MASTER_KEY is not set — using a fixed, publicly-known dev-only key. Set a real 32-byte hex key in production.');
    warnedAboutDevKey = true;
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error('EOS_KMS_MASTER_KEY must be a 64-character hex string (32 bytes) for AES-256');
  }
  return Buffer.from(hex, 'hex');
}

/** Encrypts `plaintext` with the given 32-byte key, returning a single
 *  self-contained string: `base64(iv).base64(authTag).base64(ciphertext)`.
 *  A fresh random IV every call (AES-GCM requires never reusing an IV
 *  under the same key). */
export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12); // 96-bit IV, the GCM-recommended size
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join('.');
}

/** Inverse of encryptSecret. Throws if the bundle is malformed or the
 *  auth tag doesn't verify (tampered/wrong-key ciphertext) — GCM's
 *  authentication is exactly what catches that, not a manual check. */
export function decryptSecret(bundle: string, key: Buffer): string {
  const parts = bundle.split('.');
  if (parts.length !== 3) throw new Error('Malformed encrypted-secret bundle');
  const [ivB64, authTagB64, ciphertextB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(authTagB64, 'base64');
  const ciphertext = Buffer.from(ciphertextB64, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString('utf8');
}

/** Constant-time equality — exported for callers that need to compare
 *  two encrypted bundles or derived values without a timing side
 *  channel (same reasoning bcrypt.compare/crypto.timingSafeEqual exist
 *  for password/token checks elsewhere in this codebase). */
export function constantTimeEquals(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
