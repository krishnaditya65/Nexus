'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useCodeSearch } from '@/lib/hooks/use-repos';

// Tenant-wide, not scoped under /repos/[repoName] — the backend fans a
// `git grep` out across every repo the tenant owns (see
// services/git-host/cmd/server/main.go's codeSearchHandler), so this page
// mirrors that scope rather than pretending it's one repo's feature.
// Search runs only on explicit submit, never on keystroke, since each
// query re-shells out to `git grep` across every repo live.
export default function CodeSearchPage() {
  const t = useTranslations('codeSearch');
  const tCommon = useTranslations('common');
  const [query, setQuery] = useState('');
  const [submitted, setSubmitted] = useState('');
  const { data: matches, isLoading, error } = useCodeSearch(submitted, submitted.length > 0);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(query.trim());
        }}
        className="mb-6 flex gap-2"
      >
        <label htmlFor="code-search-query" className="sr-only">
          {t('queryLabel')}
        </label>
        <input
          id="code-search-query"
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

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {submitted && !isLoading && (
        <ul className="divide-y divide-border rounded border border-border">
          {matches?.map((m, i) => (
            <li key={`${m.repoName}-${m.filePath}-${m.lineNumber}-${i}`} className="px-4 py-2">
              <Link
                href={`/repos/${m.repoName}/files?path=${encodeURIComponent(m.filePath)}`}
                className="font-mono text-xs text-accent hover:underline"
              >
                {m.repoName}/{m.filePath}:{m.lineNumber}
              </Link>
              <pre className="mt-1 overflow-x-auto text-xs text-text-secondary">{m.line}</pre>
            </li>
          ))}
          {matches?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
        </ul>
      )}
    </div>
  );
}
