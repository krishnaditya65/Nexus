import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Release {
  id: string;
  name: string;
  description: string;
  release_date: string | null;
  status: 'unreleased' | 'released' | 'archived';
}

export interface ReleaseNotes {
  release: Release;
  ticketsByType: Record<string, Array<{ id: string; ticket_number: number; type: string; title: string; state_name: string }>>;
}

export function useReleases(projectId: string | null) {
  return useQuery<Release[], ApiError>({
    queryKey: ['releases', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/releases?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateRelease(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Release, ApiError, { name: string; description?: string; releaseDate?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/releases', { method: 'POST', body: JSON.stringify({ projectId, ...body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  });
}

export function useSetReleaseStatus(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Release, ApiError, { releaseId: string; status: string }>({
    mutationFn: ({ releaseId, status }) => apiFetch(SERVICE_URLS.pm, `/releases/${releaseId}/status`, { method: 'POST', body: JSON.stringify({ status }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['releases', projectId] }),
  });
}

export function useReleaseNotes(releaseId: string | null) {
  return useQuery<ReleaseNotes, ApiError>({
    queryKey: ['release-notes', releaseId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/releases/${releaseId}/notes`),
    enabled: !!releaseId,
  });
}

export function useTagTicketRelease() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { ticketId: string; releaseId: string | null }>({
    mutationFn: ({ ticketId, releaseId }) => apiFetch(SERVICE_URLS.pm, `/releases/tickets/${ticketId}/tag`, { method: 'POST', body: JSON.stringify({ releaseId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['release-notes'] }),
  });
}
