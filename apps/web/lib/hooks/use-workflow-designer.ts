// Visual workflow designer (docs/FEATURES.md §13.1) — state-graph CRUD,
// distinct from use-workflow-transitions.ts's logic-gates editor (that
// edits Conditions/Validators/Post Functions on an ALREADY-EXISTING
// transition; this creates/deletes the states and transitions themselves).
// Reuses the same read endpoints (GET .../workflow-states,
// .../workflow-transitions) as their existing consumers — this hook only
// adds the mutations.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface WorkflowState {
  id: string;
  project_id: string;
  name: string;
  position: number;
  is_initial: boolean;
  is_terminal: boolean;
}

export interface WorkflowTransitionEdge {
  id: string;
  from_state_id: string;
  to_state_id: string;
  from_state_name: string;
  to_state_name: string;
  name: string;
}

export function useWorkflowStates(projectId: string | null) {
  return useQuery<WorkflowState[], ApiError>({
    queryKey: ['workflowStates', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/workflow-states`),
    enabled: !!projectId,
  });
}

export function useWorkflowEdges(projectId: string | null) {
  return useQuery<WorkflowTransitionEdge[], ApiError>({
    queryKey: ['workflowTransitions', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/workflow-transitions`),
    enabled: !!projectId,
  });
}

function invalidateGraph(qc: ReturnType<typeof useQueryClient>, projectId: string | null) {
  qc.invalidateQueries({ queryKey: ['workflowStates', projectId] });
  qc.invalidateQueries({ queryKey: ['workflowTransitions', projectId] });
}

export function useCreateWorkflowState(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<WorkflowState, ApiError, { name: string; isInitial?: boolean; isTerminal?: boolean }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/workflow-states`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateGraph(qc, projectId),
  });
}

export function useUpdateWorkflowState(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<WorkflowState, ApiError, { id: string; name?: string; isInitial?: boolean; isTerminal?: boolean }>({
    mutationFn: ({ id, ...body }) =>
      apiFetch(SERVICE_URLS.pm, `/projects/workflow-states/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => invalidateGraph(qc, projectId),
  });
}

export function useDeleteWorkflowState(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiFetch(SERVICE_URLS.pm, `/projects/workflow-states/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateGraph(qc, projectId),
  });
}

export function useCreateWorkflowEdge(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<WorkflowTransitionEdge, ApiError, { name: string; fromStateId: string; toStateId: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/workflow-transitions`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => invalidateGraph(qc, projectId),
  });
}

export function useDeleteWorkflowEdge(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiFetch(SERVICE_URLS.pm, `/projects/workflow-transitions/${id}`, { method: 'DELETE' }),
    onSuccess: () => invalidateGraph(qc, projectId),
  });
}
