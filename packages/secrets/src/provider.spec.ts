import {
  EnvSecretsProvider,
  VaultSecretsProvider,
  AwsSecretsManagerSecretsProvider,
  SecretsProviderNotImplementedError,
  resolveSecretsProvider,
} from './provider';

describe('EnvSecretsProvider', () => {
  it('reads a real env var', async () => {
    process.env.TEST_SECRET_X = 'shh';
    const provider = new EnvSecretsProvider();
    expect(await provider.getSecret('TEST_SECRET_X')).toBe('shh');
    delete process.env.TEST_SECRET_X;
  });

  it('returns undefined for an unset var, not throwing', async () => {
    const provider = new EnvSecretsProvider();
    expect(await provider.getSecret('DEFINITELY_NOT_SET_XYZ')).toBeUndefined();
  });

  it('getSecretSync reads the same value synchronously', () => {
    process.env.TEST_SECRET_Y = 'sync-shh';
    const provider = new EnvSecretsProvider();
    expect(provider.getSecretSync('TEST_SECRET_Y')).toBe('sync-shh');
    delete process.env.TEST_SECRET_Y;
  });
});

describe('VaultSecretsProvider / AwsSecretsManagerSecretsProvider', () => {
  it('Vault fails closed with a named error, never a silent undefined', async () => {
    const provider = new VaultSecretsProvider('http://vault', 'token');
    await expect(provider.getSecret('anything')).rejects.toThrow(SecretsProviderNotImplementedError);
  });

  it('AWS Secrets Manager fails closed with a named error', async () => {
    const provider = new AwsSecretsManagerSecretsProvider('us-east-1');
    await expect(provider.getSecret('anything')).rejects.toThrow(SecretsProviderNotImplementedError);
  });
});

describe('resolveSecretsProvider', () => {
  it('defaults to env when SECRETS_PROVIDER is unset', () => {
    expect(resolveSecretsProvider({})).toBeInstanceOf(EnvSecretsProvider);
  });

  it('resolves "env" explicitly', () => {
    expect(resolveSecretsProvider({ SECRETS_PROVIDER: 'env' })).toBeInstanceOf(EnvSecretsProvider);
  });

  it('resolves "vault"', () => {
    expect(resolveSecretsProvider({ SECRETS_PROVIDER: 'vault' })).toBeInstanceOf(VaultSecretsProvider);
  });

  it('resolves "aws_secrets_manager"', () => {
    expect(resolveSecretsProvider({ SECRETS_PROVIDER: 'aws_secrets_manager' })).toBeInstanceOf(AwsSecretsManagerSecretsProvider);
  });

  it('throws on an unknown provider name', () => {
    expect(() => resolveSecretsProvider({ SECRETS_PROVIDER: 'bogus' })).toThrow(/Unknown SECRETS_PROVIDER/);
  });
});
