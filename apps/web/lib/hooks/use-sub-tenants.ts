// Sub-tenant isolation (docs/FEATURES.md §11.1) — division CRUD plus the
// governed cross-division access-token mint. See AuthService.accessSubTenant's
// docblock for why this mints an ordinary token rather than some separate
// "impersonation" mechanism.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface SubTenant {
  id: string;
  name: string;
  slug: string;
  parent_tenant_id: string | null;
  created_at: string;
}

export function useSubTenants() {
  return useQuery<SubTenant[], ApiError>({
    queryKey: ['subTenants'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/tenants/sub-tenants'),
  });
}

export function useCreateSubTenant() {
  const qc = useQueryClient();
  return useMutation<SubTenant, ApiError, { name: string; slug: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/tenants/sub-tenants', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subTenants'] }),
  });
}

export interface SubTenantAccessResult {
  accessToken: string;
  tenantId: string;
  tenantSlug: string;
}

export function useAccessSubTenant() {
  return useMutation<SubTenantAccessResult, ApiError, string>({
    mutationFn: (subTenantId) =>
      apiFetch(SERVICE_URLS.auth, `/auth/sub-tenants/${subTenantId}/access`, { method: 'POST' }),
  });
}
