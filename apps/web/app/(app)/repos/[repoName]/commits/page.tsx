'use client';

import { useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { useBranches, useCommits } from '@/lib/hooks/use-repos';

export default function CommitsPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('repos');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const ref = useSearchParams().get('ref') ?? '';
  const { data: branches } = useBranches(repoName);
  const { data: commits, isLoading, error } = useCommits(repoName, ref, '');

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('commitsTitle', { repoName })}</h1>
        <select
          className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
          value={ref}
          onChange={(e) => {
            const url = new URL(window.location.href);
            if (e.target.value) url.searchParams.set('ref', e.target.value);
            else url.searchParams.delete('ref');
            window.location.href = url.toString();
          }}
        >
          {!ref && <option value="">{t('defaultBranch')}</option>}
          {branches?.map((b) => (
            <option key={b.name} value={b.name}>
              {b.name}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {commits?.map((c) => (
          <li key={c.sha} className="px-4 py-3">
            <p className="text-sm font-medium">{c.subject}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {c.author} · <span className="font-mono">{c.sha.slice(0, 7)}</span> · {new Date(c.date).toLocaleString()}
            </p>
          </li>
        ))}
        {commits?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyCommits')}</li>}
      </ul>
    </div>
  );
}
