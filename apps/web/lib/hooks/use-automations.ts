// Wraps services/pm's §12.2 automation/rules engine — a generic
// "when X then Y" rule per project. Trigger/action types are fixed enums
// today (see services/pm/src/automations/automations.service.ts's
// TRIGGER_TYPES/ACTION_TYPES), matched here so the UI's dropdowns never
// offer something the backend would 400 on.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export const TRIGGER_TYPES = ['ticket_created', 'status_changed', 'assigned', 'stale_unassigned'] as const;
export const ACTION_TYPES = ['notify_watchers', 'notify_assignee', 'assign_user', 'transition'] as const;

export interface Automation {
  id: string;
  project_id: string;
  name: string;
  trigger_type: string;
  trigger_config: Record<string, unknown>;
  action_type: string;
  action_config: Record<string, unknown>;
  enabled: boolean;
  created_by_user_id: string;
  created_at: string;
}

export interface AutomationRun {
  id: string;
  automation_id: string;
  ticket_id: string;
  status: 'succeeded' | 'failed';
  detail: string | null;
  ran_at: string;
}

export function useAutomations(projectId: string | null) {
  return useQuery<Automation[], ApiError>({
    queryKey: ['automations', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/automations?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateAutomation(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    Automation,
    ApiError,
    {
      name: string;
      triggerType: string;
      triggerConfig?: Record<string, unknown>;
      actionType: string;
      actionConfig?: Record<string, unknown>;
    }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/automations', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', projectId] }),
  });
}

export function useSetAutomationEnabled(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Automation, ApiError, { id: string; enabled: boolean }>({
    mutationFn: ({ id, enabled }) =>
      apiFetch(SERVICE_URLS.pm, `/automations/${id}/enabled`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', projectId] }),
  });
}

export function useDeleteAutomation(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.pm, `/automations/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['automations', projectId] }),
  });
}

export function useAutomationRuns(automationId: string | null) {
  return useQuery<AutomationRun[], ApiError>({
    queryKey: ['automationRuns', automationId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/automations/${automationId}/runs`),
    enabled: !!automationId,
  });
}
