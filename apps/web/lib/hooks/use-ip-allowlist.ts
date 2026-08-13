// Wraps services/auth's IP allowlisting endpoints (docs/FEATURES.md
// §11.1). Own-tenant only — the backend scopes every route off the
// caller's own verified JWT, never a path param.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface IpAllowlistEntry {
  id: string;
  cidr: string;
  description: string;
  created_at: string;
}

export function useIpAllowlist() {
  return useQuery<IpAllowlistEntry[], ApiError>({
    queryKey: ['ipAllowlist'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/tenants/ip-allowlist'),
  });
}

export function useAddIpAllowlistEntry() {
  const qc = useQueryClient();
  return useMutation<IpAllowlistEntry, ApiError, { cidr: string; description?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/tenants/ip-allowlist', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ipAllowlist'] }),
  });
}

export function useRemoveIpAllowlistEntry() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.auth, `/tenants/ip-allowlist/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ipAllowlist'] }),
  });
}
