// Wraps services/cicd's runner registration API (self-hosted/BYO runner
// registration, docs/FEATURES.md §11.4). Tenant-wide, not per-repo — any
// pipeline in any repo can target a runner's label via `runsOn:`, so this
// mirrors code-search's top-level-page treatment rather than nesting
// under /repos/[repoName].
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Runner {
  id: string;
  name: string;
  labels: string[];
  status: 'online' | 'offline';
  last_heartbeat_at: string | null;
  created_at: string;
}

export interface RegisteredRunner extends Runner {
  // Only present in the response to the register() call itself — the raw
  // bearer token is never retrievable again afterward (see
  // RunnersService.register's docblock).
  token: string;
}

export function useRunners() {
  return useQuery<Runner[], ApiError>({
    queryKey: ['runners'],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, '/runners'),
    refetchInterval: 15_000, // status/last-heartbeat changes as agents come and go
  });
}

export function useRegisterRunner() {
  const qc = useQueryClient();
  return useMutation<RegisteredRunner, ApiError, { name: string; labels: string[] }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.cicd, '/runners', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runners'] }),
  });
}

export function useRemoveRunner() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.cicd, `/runners/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runners'] }),
  });
}
