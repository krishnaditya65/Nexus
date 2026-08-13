// Wraps auth's append-only audit_log — the Activity Feed (ADO nav §10).
import { useMutation, useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export function useAuditLog(limit = 100) {
  return useQuery<AuditEvent[], ApiError>({
    queryKey: ['auditLog', limit],
    queryFn: () => apiFetch(SERVICE_URLS.auth, `/audit-log?limit=${limit}`),
  });
}

export interface AuditChainVerification {
  valid: boolean;
  brokenAtId?: string;
  reason?: string;
  entriesChecked: number;
}

// A mutation (not a query) even though it's a GET under the hood — this
// is a deliberate, potentially-expensive on-demand action (re-hashes the
// entire chain), not something that should run automatically on page
// load or refetch on an interval.
export function useVerifyAuditChain() {
  return useMutation<AuditChainVerification, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.auth, '/audit-log/verify'),
  });
}
