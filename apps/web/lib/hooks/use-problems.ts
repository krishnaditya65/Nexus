// Problem Management (docs/FEATURES.md §13.7) — wraps
// services/incident-management's new problems.controller.ts. See
// ProblemsService's docblock for how this differs from Incident response.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type ProblemStatus = 'new' | 'investigating' | 'known_error' | 'resolved' | 'closed';

export interface Problem {
  id: string;
  title: string;
  description: string;
  status: ProblemStatus;
  root_cause: string | null;
  workaround: string | null;
  owner_user_id: string | null;
  action_items: Array<{ description: string; owner_user_id?: string; status?: string }>;
  created_at: string;
  resolved_at: string | null;
}

export interface LinkedIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
  started_at: string;
  resolved_at: string | null;
}

export interface ProblemDetail extends Problem {
  linkedIncidents: LinkedIncident[];
}

export function useProblems(status?: ProblemStatus) {
  return useQuery<Problem[], ApiError>({
    queryKey: ['problems', status],
    queryFn: () => apiFetch(SERVICE_URLS.incidentManagement, `/problems${status ? `?status=${status}` : ''}`),
  });
}

export function useProblem(id: string | null) {
  return useQuery<ProblemDetail, ApiError>({
    queryKey: ['problem', id],
    queryFn: () => apiFetch(SERVICE_URLS.incidentManagement, `/problems/${id}`),
    enabled: !!id,
  });
}

export function useCreateProblem() {
  const qc = useQueryClient();
  return useMutation<Problem, ApiError, { title: string; description?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.incidentManagement, '/problems', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['problems'] }),
  });
}

export function useUpdateProblem(id: string | null) {
  const qc = useQueryClient();
  return useMutation<
    Problem,
    ApiError,
    { status?: ProblemStatus; rootCause?: string; workaround?: string; actionItems?: unknown[] }
  >({
    mutationFn: (body) => apiFetch(SERVICE_URLS.incidentManagement, `/problems/${id}`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['problem', id] });
      qc.invalidateQueries({ queryKey: ['problems'] });
    },
  });
}

export function useLinkIncident(problemId: string | null) {
  const qc = useQueryClient();
  return useMutation<LinkedIncident, ApiError, { incidentId: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.incidentManagement, `/problems/${problemId}/link-incident`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['problem', problemId] }),
  });
}
