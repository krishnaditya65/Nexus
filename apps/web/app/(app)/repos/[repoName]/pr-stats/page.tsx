'use client';

import { useTranslations } from 'next-intl';
import { usePullRequests } from '@/lib/hooks/use-repos';

function averageMergeHours(prs: { status: string; createdAt: string; mergedAt?: string }[]): number | null {
  const merged = prs.filter((pr) => pr.status === 'merged' && pr.mergedAt);
  if (merged.length === 0) return null;
  const totalHours = merged.reduce((sum, pr) => {
    const hours = (new Date(pr.mergedAt as string).getTime() - new Date(pr.createdAt).getTime()) / 3_600_000;
    return sum + hours;
  }, 0);
  return totalHours / merged.length;
}

export default function PrCompletionStatsPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('repos');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: pulls, isLoading, error } = usePullRequests(repoName);

  const open = pulls?.filter((p) => p.status === 'open').length ?? 0;
  const merged = pulls?.filter((p) => p.status === 'merged').length ?? 0;
  const closed = pulls?.filter((p) => p.status === 'closed').length ?? 0;
  const total = pulls?.length ?? 0;
  const avgHours = pulls ? averageMergeHours(pulls) : null;
  const mergeRate = total > 0 ? Math.round((merged / total) * 100) : null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">{t('prStatsTitle', { repoName })}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {pulls && (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="text-2xl font-semibold">{total}</p>
            <p className="text-xs text-text-secondary">{t('statTotal')}</p>
          </div>
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="text-2xl font-semibold">{open}</p>
            <p className="text-xs text-text-secondary">{t('statOpen')}</p>
          </div>
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="text-2xl font-semibold">{merged}</p>
            <p className="text-xs text-text-secondary">{t('statMerged')}</p>
          </div>
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="text-2xl font-semibold">{closed}</p>
            <p className="text-xs text-text-secondary">{t('statClosed')}</p>
          </div>
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="text-2xl font-semibold">{mergeRate != null ? `${mergeRate}%` : '—'}</p>
            <p className="text-xs text-text-secondary">{t('statMergeRate')}</p>
          </div>
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="text-2xl font-semibold">{avgHours != null ? avgHours.toFixed(1) : '—'}</p>
            <p className="text-xs text-text-secondary">{t('statAvgMergeHours')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
