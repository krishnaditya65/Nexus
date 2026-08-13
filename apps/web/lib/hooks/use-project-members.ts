// §12.7 — explicit per-project membership, the thing that actually
// restricts a guest (services/auth's is_guest) to one project. A normal
// tenant member is never checked against this at all.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface ProjectMember {
  user_id: string;
  added_by_user_id: string;
  created_at: string;
}

export function useProjectMembers(projectId: string | null) {
  return useQuery<ProjectMember[], ApiError>({
    queryKey: ['projectMembers', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/members`),
    enabled: !!projectId,
  });
}

export function useAddProjectMember(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<ProjectMember, ApiError, string>({
    mutationFn: (userId) =>
      apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/members`, { method: 'POST', body: JSON.stringify({ userId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projectMembers', projectId] }),
  });
}

export function useRemoveProjectMember(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (userId) => apiFetch(SERVICE_URLS.pm, `/projects/${projectId}/members/${userId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projectMembers', projectId] }),
  });
}
