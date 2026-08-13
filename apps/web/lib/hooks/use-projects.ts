import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Project {
  id: string;
  key: string;
  name: string;
  created_at: string;
}

export function useProjects() {
  return useQuery<Project[], ApiError>({
    queryKey: ['projects'],
    queryFn: () => apiFetch(SERVICE_URLS.pm, '/projects'),
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation<Project, ApiError, { key: string; name: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/projects', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['projects'] }),
  });
}
