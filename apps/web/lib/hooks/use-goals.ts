// §12.5 lightweight Goals — the everyday version of §11.7's OKRs, no
// Objective/Key-Result ceremony, always manually updated.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type GoalType = 'numeric' | 'currency' | 'task_count';

export interface Goal {
  id: string;
  name: string;
  goal_type: GoalType;
  target_value: string;
  current_value: string;
  unit: string;
  status: 'active' | 'achieved' | 'archived';
  due_date: string | null;
  progressPercent: number;
}

export function useGoals(projectId: string | null) {
  return useQuery<Goal[], ApiError>({
    queryKey: ['goals', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/goals?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateGoal(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Goal, ApiError, { name: string; goalType: GoalType; targetValue: number; unit?: string; dueDate?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/goals', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals', projectId] }),
  });
}

export function useUpdateGoalValue(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Goal, ApiError, { id: string; currentValue: number }>({
    mutationFn: ({ id, currentValue }) =>
      apiFetch(SERVICE_URLS.pm, `/goals/${id}/value`, { method: 'PATCH', body: JSON.stringify({ currentValue }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals', projectId] }),
  });
}

export function useSetGoalStatus(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Goal, ApiError, { id: string; status: string }>({
    mutationFn: ({ id, status }) =>
      apiFetch(SERVICE_URLS.pm, `/goals/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals', projectId] }),
  });
}

export function useDeleteGoal(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.pm, `/goals/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['goals', projectId] }),
  });
}
