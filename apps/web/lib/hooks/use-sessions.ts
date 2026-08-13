// Wraps services/auth's session management endpoints (docs/FEATURES.md
// §11.1 "session management UI (list/remote-sign-out)"). Revocation is
// enforced against auth-service's own routes on every request; other
// services verify JWTs locally via JWKS with no live channel back to the
// session table, so a revoked session's token can remain technically
// valid against THEM until its natural ≤1h expiry — see
// services/auth/src/sessions/*'s docblocks for the full explanation.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Session {
  id: string;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
  last_seen_at: string;
  revoked_at: string | null;
  isCurrent: boolean;
}

export function useSessions() {
  return useQuery<Session[], ApiError>({
    queryKey: ['sessions'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/sessions'),
  });
}

export function useRevokeSession() {
  const qc = useQueryClient();
  return useMutation<Session, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.auth, `/sessions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}

export function useRevokeOtherSessions() {
  const qc = useQueryClient();
  return useMutation<{ revokedCount: number }, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.auth, '/sessions/revoke-others', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['sessions'] }),
  });
}
