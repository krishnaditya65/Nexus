// BYOK — customer-managed KMS keys (docs/FEATURES.md §11.1) — wraps
// services/auth's GET/POST /tenants/kms-key. See @nexus/kms's byok.ts
// docblock: the config surface is real, the actual AWS/Azure/GCP KMS API
// calls for a non-platform-managed provider are a disclosed stub.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type KmsProvider = 'platform_managed' | 'aws_kms' | 'azure_keyvault' | 'gcp_kms';

export interface KmsKeyConfig {
  provider: KmsProvider;
  keyReference: string;
  registeredAt: string | null;
}

export function useKmsKeyConfig() {
  return useQuery<KmsKeyConfig, ApiError>({
    queryKey: ['kmsKeyConfig'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/tenants/kms-key'),
  });
}

export function useSetKmsKeyConfig() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { provider: KmsProvider; keyReference: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/tenants/kms-key', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kmsKeyConfig'] }),
  });
}
