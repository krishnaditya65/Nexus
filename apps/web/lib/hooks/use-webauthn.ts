import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { startRegistration, type PublicKeyCredentialCreationOptionsJSON } from '@simplewebauthn/browser';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface WebauthnCredential {
  id: string;
  nickname: string | null;
  deviceType: string;
  backedUp: boolean;
  transports: string[];
  createdAt: string;
  lastUsedAt: string | null;
}

export function useWebauthnCredentials() {
  return useQuery<WebauthnCredential[], ApiError>({
    queryKey: ['webauthn-credentials'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/auth/webauthn/credentials'),
  });
}

/** Runs the full browser ceremony (fetch options → navigator.credentials.create
 *  via @simplewebauthn/browser → verify) as one mutation, since a
 *  half-finished registration isn't a meaningful intermediate UI state —
 *  the browser prompt is modal by nature. Throws with a readable message
 *  if the user cancels the platform/security-key prompt (NotAllowedError),
 *  which @simplewebauthn/browser already normalizes. */
export function useRegisterPasskey() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, { nickname?: string }>({
    mutationFn: async ({ nickname }) => {
      const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
        SERVICE_URLS.auth,
        '/auth/webauthn/register/options',
        { method: 'POST', body: '{}' },
      );
      const response = await startRegistration({ optionsJSON: options });
      return apiFetch(SERVICE_URLS.auth, '/auth/webauthn/register/verify', {
        method: 'POST',
        body: JSON.stringify({ response, nickname }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['webauthn-credentials'] });
      qc.invalidateQueries({ queryKey: ['mfa-status'] });
    },
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.auth, `/auth/webauthn/credentials/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webauthn-credentials'] }),
  });
}
