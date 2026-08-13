'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRuns, useTriggerRun } from '@/lib/hooks/use-pipelines';

const STATUS_KEY: Record<string, string> = {
  queued: 'statusQueued',
  running: 'statusRunning',
  succeeded: 'statusSucceeded',
  failed: 'statusFailed',
};

export default function PipelineRunsPage({ params }: { params: { repoName: string; pipelineId: string } }) {
  const t = useTranslations('pipelines');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: runs, isLoading, error } = useRuns(params.pipelineId);
  const triggerRun = useTriggerRun(params.pipelineId);
  const [commitRef, setCommitRef] = useState('main');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 text-xl font-semibold">{t('runTitle', { pipelineName: params.pipelineId })}</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          triggerRun.mutate({ commitRef });
        }}
        className="mb-6 flex gap-2"
      >
        <label htmlFor="commit-ref" className="sr-only">
          Commit ref
        </label>
        <input
          id="commit-ref"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('commitRefPlaceholder')}
          value={commitRef}
          onChange={(e) => setCommitRef(e.target.value)}
        />
        <button
          type="submit"
          disabled={triggerRun.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('triggerRun')}
        </button>
      </form>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {runs?.map((run) => (
          <li key={run.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <span className="mr-2 font-mono text-text-secondary">{run.commit_ref}</span>
              <span
                className={
                  run.status === 'succeeded'
                    ? 'text-success'
                    : run.status === 'failed'
                      ? 'text-danger'
                      : 'text-text-secondary'
                }
              >
                {t(STATUS_KEY[run.status] as any)}
              </span>
            </div>
            <Link
              href={`/repos/${repoName}/pipelines/${params.pipelineId}/runs/${run.id}`}
              className="text-accent hover:underline"
            >
              {t('viewRun')}
            </Link>
          </li>
        ))}
        {runs?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
