// Device fingerprinting + "new device" login challenge (docs/FEATURES.md
// §11.1) — wraps services/auth's new /auth/devices + /tenants/
// device-challenge-required. See DevicesService's docblock.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface KnownDevice {
  id: string;
  first_seen_at: string;
  last_seen_at: string;
}

export function useKnownDevices() {
  return useQuery<KnownDevice[], ApiError>({
    queryKey: ['knownDevices'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/auth/devices'),
  });
}

export function useForgetDevice() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiFetch(SERVICE_URLS.auth, `/auth/devices/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['knownDevices'] }),
  });
}

export function useDeviceChallengeRequired() {
  return useQuery<{ required: boolean }, ApiError>({
    queryKey: ['deviceChallengeRequired'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/tenants/device-challenge-required'),
  });
}

export function useSetDeviceChallengeRequired() {
  const qc = useQueryClient();
  return useMutation<{ device_challenge_required: boolean }, ApiError, { required: boolean }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.auth, '/tenants/device-challenge-required', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['deviceChallengeRequired'] }),
  });
}
