// Typed custom fields + per-screen layouts (docs/FEATURES.md §13.1) —
// wraps services/pm's custom-fields.controller.ts. See
// CustomFieldsService's docblock (services/pm) for the fixed field-type
// vocabulary these definitions are validated against server-side.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type FieldType = 'text' | 'number' | 'date' | 'checkbox' | 'select' | 'multiselect' | 'user_picker';

export interface CustomFieldDefinition {
  id: string;
  project_id: string;
  key: string;
  label: string;
  field_type: FieldType;
  options: string[];
  issue_types: string[];
  is_required: boolean;
  position: number;
  // Field-level RBAC (§11.1) — null means unrestricted; a permission key
  // (e.g. 'fields.view_restricted') hides this field's value from a
  // ticket read for callers who lack it and aren't owner/admin.
  restricted_to_permission: string | null;
}

export interface ScreenField {
  fieldId: string;
  position: number;
  key: string;
  label: string;
  fieldType: FieldType;
  options: string[];
  isRequired: boolean;
}

export function useCustomFieldDefinitions(projectId: string | null) {
  return useQuery<CustomFieldDefinition[], ApiError>({
    queryKey: ['customFieldDefinitions', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/custom-fields`),
    enabled: !!projectId,
  });
}

export function useCreateCustomFieldDefinition(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    CustomFieldDefinition,
    ApiError,
    {
      key: string;
      label: string;
      fieldType: FieldType;
      options?: string[];
      issueTypes?: string[];
      isRequired?: boolean;
      restrictedToPermission?: string | null;
    }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/custom-fields`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customFieldDefinitions', projectId] }),
  });
}

export function useDeleteCustomFieldDefinition(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/custom-fields/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customFieldDefinitions', projectId] }),
  });
}

export function useFieldScreen(projectId: string | null, issueType: string, screen: 'create' | 'edit') {
  return useQuery<ScreenField[], ApiError>({
    queryKey: ['customFieldScreen', projectId, issueType, screen],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/custom-fields/screens?issueType=${issueType}&screen=${screen}`),
    enabled: !!projectId,
  });
}

export function useSetFieldScreen(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { issueType: string; screen: 'create' | 'edit'; fieldIds: string[] }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/custom-fields/screens`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (_, vars) =>
      qc.invalidateQueries({ queryKey: ['customFieldScreen', projectId, vars.issueType, vars.screen] }),
  });
}

export function useSetTicketCustomFields(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation<any, ApiError, { fields: Record<string, unknown> }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/custom-fields`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket', ticketId] }),
  });
}
