// BYOK (Bring Your Own Key) — customer-managed KMS keys (docs/FEATURES.md
// §11.1). The default, "platform_managed" tier is envelope.ts's real
// AES-256-GCM encryption under this platform's own master key. A tenant
// that registers an external provider (AWS KMS / Azure Key Vault / GCP
// KMS) is asking THEIR key, not ours, to protect their secrets — real
// BYOK means every encrypt/decrypt for that tenant round-trips through
// their cloud account's KMS API.
//
// **Honestly-disclosed scope**: this interface and the tenant-facing
// config surface (services/auth's tenant_kms_keys table) are real and
// fully wired; the actual AWS/Azure/GCP SDK calls are NOT implemented —
// this build has no cloud credentials to call a real KMS API with, and
// bundling all three cloud SDKs for a call path that could never
// actually succeed in this environment would be dead weight, not a
// real feature. `StubExternalKmsResolver` throws a clear, specific error
// naming exactly what's missing — never a silent fallback to the
// platform key (that would SILENTLY defeat the entire point of BYOK: a
// tenant who registered their own key needs to know immediately if it
// stopped being honored, not discover it later during an audit).
export type KmsProvider = 'platform_managed' | 'aws_kms' | 'azure_keyvault' | 'gcp_kms';

export const KMS_PROVIDERS: KmsProvider[] = ['platform_managed', 'aws_kms', 'azure_keyvault', 'gcp_kms'];

export interface TenantKmsConfig {
  provider: KmsProvider;
  keyReference: string | null; // ARN / Key Vault URI / resource name — null for platform_managed
}

/** A real interface a real cloud-SDK implementation would satisfy —
 *  `wrap`/`unwrap` are the two operations every cloud KMS API exposes
 *  for envelope encryption (encrypt/decrypt a small data key, never the
 *  actual secret payload directly — that's what makes it "envelope"
 *  encryption, same shape as this file's platform-managed tier). */
export interface ExternalKmsResolver {
  wrapDataKey(keyReference: string, dataKey: Buffer): Promise<string>;
  unwrapDataKey(keyReference: string, wrappedKey: string): Promise<Buffer>;
}

export class KmsNotImplementedError extends Error {
  constructor(provider: KmsProvider) {
    super(
      `BYOK provider "${provider}" is configured but not implemented in this build — no cloud SDK credentials are available in this environment. Encrypting/decrypting for a tenant on this provider will fail closed rather than silently falling back to the platform-managed key.`,
    );
    this.name = 'KmsNotImplementedError';
  }
}

/** Disclosed stub — see this file's docblock. Fails closed (throws),
 *  never falls back silently. */
export class StubExternalKmsResolver implements ExternalKmsResolver {
  async wrapDataKey(keyReference: string, _dataKey: Buffer): Promise<string> {
    throw new KmsNotImplementedError(this.providerFor(keyReference));
  }

  async unwrapDataKey(keyReference: string, _wrappedKey: string): Promise<Buffer> {
    throw new KmsNotImplementedError(this.providerFor(keyReference));
  }

  private providerFor(keyReference: string): KmsProvider {
    if (keyReference.startsWith('arn:aws:kms:')) return 'aws_kms';
    if (keyReference.includes('vault.azure.net')) return 'azure_keyvault';
    if (keyReference.startsWith('projects/')) return 'gcp_kms';
    return 'aws_kms';
  }
}

/** Pure — validates a key reference looks like the provider it claims to
 *  be, before ever attempting to call out to it. Exported and unit-
 *  tested independent of any network/SDK call. */
export function isPlausibleKeyReference(provider: KmsProvider, keyReference: string): boolean {
  switch (provider) {
    case 'platform_managed':
      return keyReference.length === 0;
    case 'aws_kms':
      return /^arn:aws:kms:[a-z0-9-]+:\d{12}:key\/[a-f0-9-]+$/i.test(keyReference);
    case 'azure_keyvault':
      return /^https:\/\/[a-z0-9-]+\.vault\.azure\.net\/keys\/[a-zA-Z0-9-]+/.test(keyReference);
    case 'gcp_kms':
      return /^projects\/[^/]+\/locations\/[^/]+\/keyRings\/[^/]+\/cryptoKeys\/[^/]+$/.test(keyReference);
    default:
      return false;
  }
}
