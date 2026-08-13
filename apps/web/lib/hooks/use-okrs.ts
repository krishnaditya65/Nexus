// Wraps services/pm's OKR endpoints (docs/FEATURES.md §11.7 "OKRs linked
// to Epics"). A key result linked to an Epic reports real, automatically
// computed progress (via services/pm's existing EpicsService rollup) —
// manual updates against it are rejected by the backend, not just hidden
// in this UI.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Objective {
  id: string;
  title: string;
  description: string;
  owner_user_id: string | null;
  period: string;
  status: 'active' | 'completed' | 'abandoned';
  created_at: string;
}

export interface KeyResult {
  id: string;
  objective_id: string;
  title: string;
  epic_ticket_id: string | null;
  target_value: string;
  current_value: string;
  unit: string;
  progressPercent: number;
  progressSource: 'epic' | 'manual';
}

export function useObjectives() {
  return useQuery<Objective[], ApiError>({
    queryKey: ['objectives'],
    queryFn: () => apiFetch(SERVICE_URLS.pm, '/objectives'),
  });
}

export function useCreateObjective() {
  const qc = useQueryClient();
  return useMutation<Objective, ApiError, { title: string; description?: string; period: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/objectives', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objectives'] }),
  });
}

export function useSetObjectiveStatus() {
  const qc = useQueryClient();
  return useMutation<Objective, ApiError, { id: string; status: 'active' | 'completed' | 'abandoned' }>({
    mutationFn: ({ id, status }) =>
      apiFetch(SERVICE_URLS.pm, `/objectives/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['objectives'] }),
  });
}

export function useKeyResults(objectiveId: string | null) {
  return useQuery<KeyResult[], ApiError>({
    queryKey: ['keyResults', objectiveId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/objectives/${objectiveId}/key-results`),
    enabled: !!objectiveId,
  });
}

export function useAddKeyResult(objectiveId: string | null) {
  const qc = useQueryClient();
  return useMutation<KeyResult, ApiError, { title: string; epicTicketId?: string; targetValue?: number; unit?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/objectives/${objectiveId}/key-results`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keyResults', objectiveId] }),
  });
}

export function useUpdateKeyResultValue(objectiveId: string | null) {
  const qc = useQueryClient();
  return useMutation<KeyResult, ApiError, { id: string; currentValue: number }>({
    mutationFn: ({ id, currentValue }) =>
      apiFetch(SERVICE_URLS.pm, `/key-results/${id}/value`, { method: 'PATCH', body: JSON.stringify({ currentValue }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['keyResults', objectiveId] }),
  });
}
