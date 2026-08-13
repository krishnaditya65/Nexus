// Wraps services/ai-platform's unified semantic search (§11.8 — "code-to-
// chat semantic search" differentiator, previously indexed tickets only;
// now tickets + wiki pages + chat messages share one pgvector-backed
// index, disambiguated by sourceType). One query embedded once, searched
// across every indexed source at once.
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface SemanticSearchResult {
  source_type: 'ticket' | 'wiki_page' | 'chat_message' | string;
  source_id: string;
  content_excerpt: string;
  similarity: number;
}

export interface SemanticSearchResponse {
  results: SemanticSearchResult[];
  usedFallbackEmbedding: boolean;
}

export function useSemanticSearch(query: string, sourceTypes: string[]) {
  return useQuery<SemanticSearchResponse, ApiError>({
    queryKey: ['semantic-search', query, sourceTypes],
    queryFn: () =>
      apiFetch(
        SERVICE_URLS.aiPlatform,
        `/search?q=${encodeURIComponent(query)}${sourceTypes.length ? `&sourceTypes=${sourceTypes.join(',')}` : ''}`,
      ),
    enabled: query.trim().length > 0,
  });
}
