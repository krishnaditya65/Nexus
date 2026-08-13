// Secrets management for the platform's OWN infrastructure secrets
// (docs/FEATURES.md §11.10) — DB passwords, the JWT signing key, the
// inter-service shared secret. Genuinely distinct from §11.1's BYOK
// (@nexus/kms): BYOK is about encrypting TENANT data with a key a tenant
// controls; this is about where THIS PLATFORM's own operational secrets
// come from and how they'd be swapped from env vars to a real secrets
// manager (Vault, AWS Secrets Manager) without touching every call site.
//
// `EnvSecretsProvider` is real and is what every service actually uses
// today (and continues to use — env vars remain a legitimate, common
// deployment mechanism, not a stub). `VaultSecretsProvider`/
// `AwsSecretsManagerSecretsProvider` are the real, wired swap-in points —
// same interface, same call sites would work unchanged — but their
// actual network calls are NOT implemented: no Vault/AWS credentials are
// available in this build environment. They fail CLOSED with a specific
// named error rather than silently falling back to an env var, the same
// "never silently defeat the point of the stronger option" discipline
// @nexus/kms's StubExternalKmsResolver already established for BYOK.
export interface SecretsProvider {
  getSecret(name: string): Promise<string | undefined>;
}

export class EnvSecretsProvider implements SecretsProvider {
  async getSecret(name: string): Promise<string | undefined> {
    return process.env[name];
  }

  /** Env reads are always synchronous — exposed as a real sync method
   *  (not just the async interface method) for the small number of call
   *  sites that genuinely can't be async, like a service's signing-
   *  keypair constructor (see services/auth/src/keys/key-management.
   *  service.ts's docblock on why that one runs before Nest's async
   *  lifecycle hooks are available to it). Vault/AWS providers have no
   *  sync equivalent — a real secrets-manager call is inherently
   *  network I/O — so this method only ever exists on this provider. */
  getSecretSync(name: string): string | undefined {
    return process.env[name];
  }
}

export class SecretsProviderNotImplementedError extends Error {
  constructor(provider: string) {
    super(
      `Secrets provider "${provider}" is configured but not implemented in this build — no credentials/network access available in this environment. Reads fail closed rather than silently falling back to an env var.`,
    );
    this.name = 'SecretsProviderNotImplementedError';
  }
}

export class VaultSecretsProvider implements SecretsProvider {
  constructor(private readonly vaultAddr: string, private readonly token: string) {}
  async getSecret(_name: string): Promise<string | undefined> {
    throw new SecretsProviderNotImplementedError('vault');
  }
}

export class AwsSecretsManagerSecretsProvider implements SecretsProvider {
  constructor(private readonly region: string) {}
  async getSecret(_name: string): Promise<string | undefined> {
    throw new SecretsProviderNotImplementedError('aws_secrets_manager');
  }
}

/** Resolves which provider to use from `SECRETS_PROVIDER` (defaults to
 *  `'env'`) — the one place a real deployment would flip to Vault/AWS
 *  once real credentials exist, without any call site changing. Pure
 *  factory, no I/O, independently unit-tested. */
export function resolveSecretsProvider(env: Record<string, string | undefined> = process.env): SecretsProvider {
  const kind = env.SECRETS_PROVIDER ?? 'env';
  switch (kind) {
    case 'env':
      return new EnvSecretsProvider();
    case 'vault':
      return new VaultSecretsProvider(env.VAULT_ADDR ?? '', env.VAULT_TOKEN ?? '');
    case 'aws_secrets_manager':
      return new AwsSecretsManagerSecretsProvider(env.AWS_REGION ?? '');
    default:
      throw new Error(`Unknown SECRETS_PROVIDER "${kind}" — expected one of: env, vault, aws_secrets_manager`);
  }
}
