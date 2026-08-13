import { isPlausibleKeyReference, StubExternalKmsResolver, KmsNotImplementedError } from './byok';

describe('isPlausibleKeyReference', () => {
  it('platform_managed requires an empty reference', () => {
    expect(isPlausibleKeyReference('platform_managed', '')).toBe(true);
    expect(isPlausibleKeyReference('platform_managed', 'anything')).toBe(false);
  });

  it('validates an AWS KMS ARN shape', () => {
    expect(isPlausibleKeyReference('aws_kms', 'arn:aws:kms:us-east-1:123456789012:key/abcd1234-ab12-cd34-ef56-abcdef123456')).toBe(
      true,
    );
    expect(isPlausibleKeyReference('aws_kms', 'not-an-arn')).toBe(false);
  });

  it('validates an Azure Key Vault key URI shape', () => {
    expect(isPlausibleKeyReference('azure_keyvault', 'https://my-vault.vault.azure.net/keys/my-key')).toBe(true);
    expect(isPlausibleKeyReference('azure_keyvault', 'https://example.com/keys/my-key')).toBe(false);
  });

  it('validates a GCP KMS resource name shape', () => {
    expect(isPlausibleKeyReference('gcp_kms', 'projects/my-proj/locations/global/keyRings/my-ring/cryptoKeys/my-key')).toBe(true);
    expect(isPlausibleKeyReference('gcp_kms', 'projects/my-proj/my-key')).toBe(false);
  });
});

describe('StubExternalKmsResolver', () => {
  const resolver = new StubExternalKmsResolver();

  it('fails closed (throws) rather than silently succeeding for AWS', async () => {
    await expect(resolver.wrapDataKey('arn:aws:kms:us-east-1:123456789012:key/abcd', Buffer.from('x'))).rejects.toThrow(
      KmsNotImplementedError,
    );
  });

  it('fails closed for unwrap too', async () => {
    await expect(resolver.unwrapDataKey('arn:aws:kms:us-east-1:123456789012:key/abcd', 'wrapped')).rejects.toThrow(
      KmsNotImplementedError,
    );
  });
});
