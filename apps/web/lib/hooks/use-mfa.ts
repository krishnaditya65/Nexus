import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export function useMfaStatus() {
  return useQuery<{ enabled: boolean }, ApiError>({
    queryKey: ['mfa-status'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/auth/mfa/status'),
  });
}

export function useStartMfaEnrollment() {
  return useMutation<{ secret: string; otpauthUrl: string }, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.auth, '/auth/mfa/enroll', { method: 'POST', body: '{}' }),
  });
}

export function useConfirmMfaEnrollment() {
  const qc = useQueryClient();
  return useMutation<{ recoveryCodes: string[] }, ApiError, { code: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/auth/mfa/enroll/confirm', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mfa-status'] }),
  });
}

export function useDisableMfa() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, { password: string; code: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/auth/mfa/disable', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['mfa-status'] }),
  });
}
