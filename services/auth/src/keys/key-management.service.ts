// Owns this service's RS256 signing keypair and the public-facing JWKS
// representation of it. This is the ONLY place in the platform a private
// key is held — every other service verifies tokens against the public
// key published at GET /.well-known/jwks.json (see jwks.controller.ts) and
// never holds a secret capable of forging a token, unlike the old shared-
// HS256-secret scheme this replaces (see docs/ROADMAP.md's now-closed
// "JWT: HS256 shared-secret → RS256 + JWKS endpoint" item).
import { Injectable, Logger } from '@nestjs/common';
import {
  createPrivateKey,
  createPublicKey,
  generateKeyPairSync,
  createHash,
  KeyObject,
} from 'crypto';
import { EnvSecretsProvider } from '@nexus/secrets';

const secrets = new EnvSecretsProvider();

/** The subset of RFC 7517 JWK fields a JWKS consumer (jwks-rsa on the
 *  verify-only side) needs for an RSA public signing key. */
export interface RsaPublicJwk {
  kty: 'RSA';
  n: string;
  e: string;
  kid: string;
  alg: 'RS256';
  use: 'sig';
}

@Injectable()
export class KeyManagementService {
  private readonly logger = new Logger(KeyManagementService.name);

  private readonly privateKey: KeyObject;
  private readonly publicKey: KeyObject;
  private readonly keyId: string;
  private usingEphemeralDevKeypair = false;

  // Deliberately set up in the constructor, not an onModuleInit hook: other
  // providers (JwtStrategy, JwtModule's registerAsync factory) read the key
  // material out of this service during THEIR OWN construction, which Nest
  // runs before any module's onModuleInit hooks fire. An onModuleInit here
  // would leave those callers reading unset fields depending on init order.
  constructor() {
    // Platform-own-secrets management (docs/FEATURES.md §11.10) — routed
    // through @nexus/secrets's EnvSecretsProvider rather than a raw
    // `process.env` read, so the swap-in point for a real secrets
    // manager (Vault/AWS Secrets Manager) is one provider implementation,
    // not scattered reads across every service. **Disclosed limitation**:
    // this constructor runs synchronously, before other providers
    // (JwtStrategy, JwtModule's factory) that read key material during
    // THEIR OWN construction — see the class docblock above — so it can
    // only use EnvSecretsProvider's synchronous `getSecretSync`, not a
    // real Vault/AWS call (which is inherently async network I/O). If
    // `SECRETS_PROVIDER` is set to anything other than the default `env`,
    // this key load doesn't honor it — the ephemeral-dev-keypair fallback
    // below still fires with its own loud warning, never a silent
    // wrong-key situation.
    const privatePem = decodeMaybeBase64Pem(secrets.getSecretSync('JWT_PRIVATE_KEY_PEM'));
    const publicPem = decodeMaybeBase64Pem(secrets.getSecretSync('JWT_PUBLIC_KEY_PEM'));

    if (privatePem && publicPem) {
      this.privateKey = createPrivateKey(privatePem);
      this.publicKey = createPublicKey(publicPem);
    } else {
      // Dev/single-instance fallback: generate a fresh keypair at boot.
      // Deliberately loud, because the failure mode if this ships to a real
      // multi-instance deployment is silent and ugly — every other running
      // instance (and every service verifying against a stale JWKS cache)
      // would reject tokens signed by this one after a restart.
      this.logger.warn(
        '[keys] JWT_PRIVATE_KEY_PEM / JWT_PUBLIC_KEY_PEM not set — generating ' +
          'an EPHEMERAL RSA-2048 keypair for this process only. Every token ' +
          'issued is invalidated on restart, and this is unsafe to run as ' +
          'more than one replica (each would sign with a different key and ' +
          'other services would only ever see one of them via JWKS). Set ' +
          'both env vars (base64-encoded PEM) before any shared or ' +
          'multi-instance deployment.',
      );
      const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
      this.privateKey = privateKey;
      this.publicKey = publicKey;
      this.usingEphemeralDevKeypair = true;
    }

    // Key id: a short, stable fingerprint of the public key so verifiers
    // (and this service's own JWKS response) can identify which key signed
    // a given token without re-deriving it from the signature itself. Not
    // secret — derived purely from the public key.
    const publicDer = this.publicKey.export({ type: 'spki', format: 'der' });
    this.keyId = createHash('sha256').update(publicDer).digest('hex').slice(0, 16);

    this.logger.log(`[keys] active signing key id: ${this.keyId}${this.usingEphemeralDevKeypair ? ' (ephemeral dev keypair)' : ''}`);
  }

  /** Private key used by AuthModule's JwtModule.registerAsync factory to sign access tokens. PEM-encoded PKCS8, as @nestjs/jwt (jsonwebtoken under the hood) expects. */
  getPrivateKeyPem(): string {
    return this.privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  }

  /** Public key in PEM, used both by JwtModule (jsonwebtoken requires a public key to verify with an RS256-configured JwtService) and by this service's own JwtStrategy for local, network-free verification of its own tokens. */
  getPublicKeyPem(): string {
    return this.publicKey.export({ type: 'spki', format: 'pem' }).toString();
  }

  /** The `kid` every issued token is signed with (see AuthModule) and that this service's JWKS document advertises. */
  getKeyId(): string {
    return this.keyId;
  }

  /** RFC 7517 JWK form of the public key, for the /.well-known/jwks.json response. jwks-rsa (and any spec-compliant JWKS client) resolves a token's `kid` header to one of these. */
  getPublicJwk(): RsaPublicJwk {
    const jwk = this.publicKey.export({ format: 'jwk' }) as { n: string; e: string };
    return {
      kty: 'RSA',
      n: jwk.n,
      e: jwk.e,
      kid: this.keyId,
      alg: 'RS256',
      use: 'sig',
    };
  }
}

/** JWT_*_PEM env vars are stored base64-encoded (a raw multi-line PEM inside
 *  a .env file / docker env block is a routine source of newline-mangling
 *  bugs) — decode if the value doesn't already look like a PEM block. */
function decodeMaybeBase64Pem(value: string | undefined): string | undefined {
  if (!value) return undefined;
  if (value.includes('BEGIN')) return value; // already a raw PEM
  try {
    return Buffer.from(value, 'base64').toString('utf8');
  } catch {
    return undefined;
  }
}
