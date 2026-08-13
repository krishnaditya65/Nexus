// Platform-enforced 2FA policy (docs/FEATURES.md §13.8) — wraps
// services/auth's new POST /tenants/mfa-required. See AuthService.login's
// docblock for how this is actually enforced at login time.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export function useTenantMfaRequired() {
  return useQuery<{ mfa_required: boolean }, ApiError>({
    queryKey: ['tenantMfaRequired'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/tenants/mfa-required'),
  });
}

export function useSetTenantMfaRequired() {
  const qc = useQueryClient();
  return useMutation<{ mfa_required: boolean }, ApiError, { required: boolean }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/tenants/mfa-required', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenantMfaRequired'] }),
  });
}
