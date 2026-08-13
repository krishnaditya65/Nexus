import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type RetroCategory = 'went_well' | 'went_poorly' | 'action_item';

export interface RetrospectiveSummary {
  id: string;
  project_id: string;
  sprint_id: string | null;
  title: string;
  status: 'open' | 'closed';
  created_by_user_id: string;
  created_at: string;
}

export interface RetroItem {
  id: string;
  category: RetroCategory;
  content: string;
  author_user_id: string;
  created_at: string;
}

export interface RetrospectiveDetail extends RetrospectiveSummary {
  items: Record<RetroCategory, RetroItem[]>;
}

export function useRetrospectives(projectId: string | null) {
  return useQuery<RetrospectiveSummary[], ApiError>({
    queryKey: ['retrospectives', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/retrospectives?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useRetrospective(retroId: string | null) {
  return useQuery<RetrospectiveDetail, ApiError>({
    queryKey: ['retrospective', retroId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/retrospectives/${retroId}`),
    enabled: !!retroId,
  });
}

export function useCreateRetrospective(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<RetrospectiveSummary, ApiError, { title: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/retrospectives', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retrospectives', projectId] }),
  });
}

export function useAddRetroItem(retroId: string | null) {
  const qc = useQueryClient();
  return useMutation<RetroItem, ApiError, { category: RetroCategory; content: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/retrospectives/${retroId}/items`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retrospective', retroId] }),
  });
}

export function useRemoveRetroItem(retroId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (itemId) => apiFetch(SERVICE_URLS.pm, `/retrospectives/items/${itemId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retrospective', retroId] }),
  });
}

export function useCloseRetrospective(retroId: string | null) {
  const qc = useQueryClient();
  return useMutation<RetrospectiveDetail, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.pm, `/retrospectives/${retroId}/close`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['retrospective', retroId] }),
  });
}
