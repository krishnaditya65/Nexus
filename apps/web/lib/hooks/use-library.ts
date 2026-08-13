// Wraps services/cicd's Pipelines Library — variable groups, secure
// files, task groups. Secrets and secure-file content are write-only:
// the API never returns a secret value or a secure file's bytes once
// set, so these types never carry them either.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface VariableGroupEntry {
  id: string;
  key: string;
  isSecret: boolean;
  value: string; // masked (e.g. "••••••••") when isSecret is true
}

export interface VariableGroup {
  id: string;
  name: string;
  created_at: string;
  entries: VariableGroupEntry[];
}

export interface SecureFile {
  id: string;
  name: string;
  size_bytes: number;
  created_at: string;
}

export interface TaskGroupStep {
  name: string;
  run: string;
  image?: string;
}

export interface TaskGroup {
  id: string;
  name: string;
  steps: TaskGroupStep[];
  created_at: string;
}

export function useVariableGroups() {
  return useQuery<VariableGroup[], ApiError>({
    queryKey: ['variable-groups'],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, '/library/variable-groups'),
  });
}

export function useCreateVariableGroup() {
  const qc = useQueryClient();
  return useMutation<VariableGroup, ApiError, { name: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.cicd, '/library/variable-groups', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variable-groups'] }),
  });
}

export function useSetVariableGroupEntry(groupId: string) {
  const qc = useQueryClient();
  return useMutation<VariableGroupEntry, ApiError, { key: string; value: string; isSecret: boolean }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.cicd, `/library/variable-groups/${groupId}/entries`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variable-groups'] }),
  });
}

export function useSecureFiles() {
  return useQuery<SecureFile[], ApiError>({
    queryKey: ['secure-files'],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, '/library/secure-files'),
  });
}

export function useUploadSecureFile() {
  const qc = useQueryClient();
  return useMutation<SecureFile, ApiError, { name: string; contentBase64: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.cicd, '/library/secure-files', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['secure-files'] }),
  });
}

export function useTaskGroups() {
  return useQuery<TaskGroup[], ApiError>({
    queryKey: ['task-groups'],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, '/library/task-groups'),
  });
}

export function useCreateTaskGroup() {
  const qc = useQueryClient();
  return useMutation<TaskGroup, ApiError, { name: string; steps: TaskGroupStep[] }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.cicd, '/library/task-groups', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['task-groups'] }),
  });
}
