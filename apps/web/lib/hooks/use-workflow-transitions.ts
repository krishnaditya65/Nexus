// Workflow Conditions/Validators/Post Functions (docs/FEATURES.md §13.1) —
// wraps services/pm's new config surface. See TicketsService's
// evaluateConditions/evaluateValidators/applyPostFunctions for the fixed
// vocabulary these objects are validated against server-side.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type WorkflowCondition = { type: 'assignee_only' } | { type: 'role_in'; roles: string[] };
export type WorkflowValidator = { type: 'field_required'; field: string };
export type WorkflowPostFunction =
  | { type: 'assign_user'; userId: string }
  | { type: 'clear_field'; field: string }
  | { type: 'set_field'; field: string; value: string };

export interface WorkflowTransition {
  id: string;
  project_id: string;
  from_state_id: string;
  to_state_id: string;
  from_state_name: string;
  to_state_name: string;
  name: string;
  conditions: WorkflowCondition[];
  validators: WorkflowValidator[];
  post_functions: WorkflowPostFunction[];
}

export function useWorkflowTransitions(projectId: string | null) {
  return useQuery<WorkflowTransition[], ApiError>({
    queryKey: ['workflowTransitions', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/workflow-transitions`),
    enabled: !!projectId,
  });
}

export function useUpdateWorkflowTransition(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    WorkflowTransition,
    ApiError,
    { id: string; conditions?: WorkflowCondition[]; validators?: WorkflowValidator[]; postFunctions?: WorkflowPostFunction[] }
  >({
    mutationFn: ({ id, ...body }) =>
      apiFetch(SERVICE_URLS.pm, `/projects/workflow-transitions/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflowTransitions', projectId] }),
  });
}
