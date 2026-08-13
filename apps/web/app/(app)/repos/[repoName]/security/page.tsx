'use client';

import { useTranslations } from 'next-intl';
import { useSecurityFindings } from '@/lib/hooks/use-repos';

export default function RepoSecurityPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('security');
  const tCommon = useTranslations('common');
  const { data: findings, isLoading, error } = useSecurityFindings(params.repoName);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title', { repoName: params.repoName })}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {findings?.map((f) => (
          <li key={f.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-danger">{f.ruleName}</span>
              <span className="text-xs text-text-secondary">
                {t('branchLabel')}: {f.branch} · {t('commitLabel')}: {f.commitSha.slice(0, 7)}
              </span>
            </div>
            <p className="mt-1 font-mono text-xs text-text-secondary">
              {f.filePath}:{f.lineNumber}
            </p>
            <p className="mt-1 font-mono text-xs">{f.redactedSnippet}</p>
          </li>
        ))}
        {findings?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
