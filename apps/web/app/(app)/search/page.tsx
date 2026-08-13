'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSemanticSearch } from '@/lib/hooks/use-ai-search';

// Tenant-wide unified semantic search — §11.8's "code-to-chat semantic
// search" differentiator, one query embedded once and searched across
// every indexed source type at once (services/ai-platform's pgvector
// index). NOTE: document_embeddings doesn't carry a project/channel
// reference alongside source_id, so results here show type + excerpt +
// relevance rather than deep-linking into the ticket/wiki page/message —
// a real gap, not hidden: extending the embeddings schema with enough
// context to build a real link is follow-up work, not done here.
const SOURCE_TYPES = [
  { id: 'ticket', labelKey: 'sourceTicket' },
  { id: 'wiki_page', labelKey: 'sourceWikiPage' },
  { id: 'chat_message', labelKey: 'sourceChatMessage' },
] as const;

export default function SearchPage() {
  const t = useTranslations('search');
  const tCommon = useTranslations('common');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const { data, isLoading, error } = useSemanticSearch(submitted, selectedTypes);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
        className="mb-3 flex gap-2"
      >
        <label htmlFor="search-query" className="sr-only">
          {t('queryLabel')}
        </label>
        <input
          id="search-query"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('queryPlaceholder')}
          className="flex-1 rounded border border-border bg-surface px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={!query.trim()}
          className="rounded bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('search')}
        </button>
      </form>

      <div className="mb-6 flex flex-wrap gap-3 text-xs">
        {SOURCE_TYPES.map((st) => (
          <label key={st.id} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={selectedTypes.includes(st.id)}
              onChange={(e) =>
                setSelectedTypes((prev) => (e.target.checked ? [...prev, st.id] : prev.filter((x) => x !== st.id)))
              }
            />
            {t(st.labelKey)}
          </label>
        ))}
        <span className="text-text-secondary">{t('sourceTypesHint')}</span>
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {data?.usedFallbackEmbedding && (
        <p className="mb-3 rounded border border-warn bg-warn/10 p-2 text-xs">{t('fallbackEmbeddingWarning')}</p>
      )}

      {submitted && !isLoading && (
        <ul className="divide-y divide-border rounded border border-border">
          {data?.results.map((r) => (
            <li key={`${r.source_type}-${r.source_id}`} className="px-4 py-3">
              <div className="mb-1 flex items-center gap-2 text-xs text-text-secondary">
                <span className="rounded bg-surface-raised px-1.5 py-0.5 font-medium">{r.source_type}</span>
                <span>{t('relevance', { pct: Math.round(r.similarity * 100) })}</span>
              </div>
              <p className="text-sm text-text-primary">{r.content_excerpt}</p>
            </li>
          ))}
          {data?.results.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
        </ul>
      )}
    </div>
  );
}
