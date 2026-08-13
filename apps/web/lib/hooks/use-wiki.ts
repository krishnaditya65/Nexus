// Wraps services/pm's wiki-pages endpoints. Content is stored and shown
// as plain text (pre-wrap), not rendered markdown — see wiki.service.ts's
// docblock for why: real-time multi-cursor (Yjs) is the eventual version,
// this is "a project has somewhere to write docs at all" first.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface WikiPageSummary {
  id: string;
  project_id: string;
  parent_page_id: string | null;
  title: string;
  created_at: string;
  updated_at: string;
  // §13.7 — surfaced on the project's public customer-portal KB tab when true.
  is_public: boolean;
}

export interface WikiPage extends WikiPageSummary {
  content: string;
  created_by_user_id: string;
  updated_by_user_id: string;
}

export function useWikiPages(projectId: string | null) {
  return useQuery<WikiPageSummary[], ApiError>({
    queryKey: ['wikiPages', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/wiki-pages?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useWikiPage(pageId: string | null) {
  return useQuery<WikiPage, ApiError>({
    queryKey: ['wikiPage', pageId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/wiki-pages/${pageId}`),
    enabled: !!pageId,
  });
}

export function useCreateWikiPage(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<WikiPage, ApiError, { title: string; content?: string; parentPageId?: string | null }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/wiki-pages', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wikiPages', projectId] }),
  });
}

export function useUpdateWikiPage(pageId: string | null, projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<WikiPage, ApiError, { title: string; content: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/wiki-pages/${pageId}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['wikiPage', pageId] });
      qc.invalidateQueries({ queryKey: ['wikiPages', projectId] });
    },
  });
}

export function useDeleteWikiPage(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.pm, `/wiki-pages/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['wikiPages', projectId] }),
  });
}
