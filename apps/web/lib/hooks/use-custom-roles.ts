// Custom role builder (docs/FEATURES.md §11.1/§13.8) — wraps services/auth's
// roles endpoints. Layered on top of the existing owner/admin/member enum
// (use-tenant-users.ts's useSetUserRole), never a replacement for it.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface CustomRole {
  id: string;
  tenant_id: string;
  name: string;
  permissions: string[];
  created_at: string;
}

export function usePermissionsCatalog() {
  return useQuery<string[], ApiError>({
    queryKey: ['permissionsCatalog'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/roles/permissions-catalog'),
    staleTime: Infinity, // a fixed platform-defined catalog, not tenant data
  });
}

export function useCustomRoles() {
  return useQuery<CustomRole[], ApiError>({
    queryKey: ['customRoles'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/roles'),
  });
}

export function useCreateCustomRole() {
  const qc = useQueryClient();
  return useMutation<CustomRole, ApiError, { name: string; permissions: string[] }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/roles', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customRoles'] }),
  });
}

export function useDeleteCustomRole() {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.auth, `/roles/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customRoles'] }),
  });
}

export function useSetUserCustomRole() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { userId: string; customRoleId: string | null }>({
    mutationFn: ({ userId, customRoleId }) =>
      apiFetch(SERVICE_URLS.auth, `/users/${userId}/custom-role`, {
        method: 'PATCH',
        body: JSON.stringify({ customRoleId }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenantUsers'] }),
  });
}
