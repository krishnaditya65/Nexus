// Wraps services/pm's saved-filter/query endpoints. Filters are a plain
// array of {field, operator, value} — no client-side query-string parsing
// needed, since the backend's whitelist (filter-builder.ts) is the only
// thing that decides what's valid, and it does that server-side anyway.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Filter {
  field: string;
  operator: string;
  value?: string | number;
}

export type ViewType = 'list' | 'calendar' | 'table' | 'workload';

export interface SavedQuery {
  id: string;
  project_id: string | null;
  name: string;
  filters: Filter[];
  created_by_user_id: string;
  created_at: string;
  view_type: ViewType;
  group_by: string | null;
}

export interface QueryTicket {
  id: string;
  ticket_number: number;
  type: string;
  title: string;
  state_name: string;
  assignee_user_id: string | null;
  story_points: number | null;
  due_date: string | null;
}

// Mirrors filter-builder.ts's FILTERABLE_FIELDS/OPERATORS_BY_TYPE exactly
// — this is UI metadata only (labels, which operators to offer per
// field), never itself the source of truth for what's valid. An invalid
// combination still gets rejected server-side even if this list drifts.
export const FILTERABLE_FIELDS: { field: string; labelKey: string; type: 'text' | 'uuid' | 'number' | 'timestamp' }[] = [
  { field: 'type', labelKey: 'fieldType', type: 'text' },
  { field: 'title', labelKey: 'fieldTitle', type: 'text' },
  { field: 'ticketNumber', labelKey: 'fieldTicketNumber', type: 'number' },
  { field: 'stateName', labelKey: 'fieldState', type: 'text' },
  { field: 'assigneeUserId', labelKey: 'fieldAssignee', type: 'uuid' },
  { field: 'storyPoints', labelKey: 'fieldStoryPoints', type: 'number' },
  { field: 'dueDate', labelKey: 'fieldDueDate', type: 'timestamp' },
];

export const OPERATORS_BY_TYPE: Record<string, { operator: string; labelKey: string }[]> = {
  text: [
    { operator: 'equals', labelKey: 'opEquals' },
    { operator: 'notEquals', labelKey: 'opNotEquals' },
    { operator: 'contains', labelKey: 'opContains' },
    { operator: 'isEmpty', labelKey: 'opIsEmpty' },
    { operator: 'isNotEmpty', labelKey: 'opIsNotEmpty' },
  ],
  uuid: [
    { operator: 'equals', labelKey: 'opEquals' },
    { operator: 'notEquals', labelKey: 'opNotEquals' },
    { operator: 'isEmpty', labelKey: 'opIsEmpty' },
    { operator: 'isNotEmpty', labelKey: 'opIsNotEmpty' },
  ],
  number: [
    { operator: 'equals', labelKey: 'opEquals' },
    { operator: 'greaterThan', labelKey: 'opGreaterThan' },
    { operator: 'lessThan', labelKey: 'opLessThan' },
  ],
  timestamp: [
    { operator: 'greaterThan', labelKey: 'opGreaterThan' },
    { operator: 'lessThan', labelKey: 'opLessThan' },
  ],
};

export function useSavedQueries(projectId: string | null) {
  return useQuery<SavedQuery[], ApiError>({
    queryKey: ['savedQueries', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/queries?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useSaveQuery(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<SavedQuery, ApiError, { name: string; filters: Filter[]; viewType?: ViewType; groupBy?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/queries', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savedQueries', projectId] }),
  });
}

/** Changes a saved query/view's viewType or groupBy in place — switching
 *  a saved List view to Calendar without recreating it. */
export function useUpdateQuery(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<SavedQuery, ApiError, { id: string; viewType?: ViewType; groupBy?: string | null }>({
    mutationFn: ({ id, ...patch }) =>
      apiFetch(SERVICE_URLS.pm, `/queries/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savedQueries', projectId] }),
  });
}

export function useDeleteQuery(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.pm, `/queries/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['savedQueries', projectId] }),
  });
}

export function useExecuteQuery(projectId: string | null) {
  return useMutation<QueryTicket[], ApiError, Filter[]>({
    mutationFn: (filters) =>
      apiFetch(SERVICE_URLS.pm, '/queries/execute', { method: 'POST', body: JSON.stringify({ projectId, filters }) }),
  });
}

export function useExecuteSavedQuery(projectId: string | null) {
  return useMutation<QueryTicket[], ApiError, string>({
    mutationFn: (queryId) => apiFetch(SERVICE_URLS.pm, `/queries/${queryId}/execute?projectId=${projectId}`),
  });
}

/** Sets/clears a ticket's due date — what the Calendar view's drag-to-
 *  reschedule and the Views page's inline date picker both call. */
export function useSetTicketDueDate() {
  return useMutation<unknown, ApiError, { ticketId: string; dueDate: string | null }>({
    mutationFn: ({ ticketId, dueDate }) =>
      apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/due-date`, { method: 'POST', body: JSON.stringify({ dueDate }) }),
  });
}
