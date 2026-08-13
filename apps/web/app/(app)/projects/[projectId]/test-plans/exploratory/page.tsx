'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useExploratorySessions, useStartExploratorySession } from '@/lib/hooks/use-qa';

export default function ExploratorySessionsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('exploratorySessions');
  const tCommon = useTranslations('common');
  const { data: sessions, isLoading, error } = useExploratorySessions(params.projectId);
  const startSession = useStartExploratorySession(params.projectId);
  const [charter, setCharter] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {sessions?.map((session) => (
          <li key={session.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="text-sm">{session.charter}</div>
              <div className="mt-1 flex items-center gap-2 text-xs text-text-secondary">
                <span className="rounded bg-surface px-1.5 py-0.5">
                  {session.status === 'in_progress' ? t('statusInProgress') : t('statusCompleted')}
                </span>
                {session.outcome && (
                  <span className="rounded bg-surface px-1.5 py-0.5">
                    {session.outcome === 'passed' ? t('outcomePassed') : t('outcomeIssuesFound')}
                  </span>
                )}
              </div>
            </div>
            <Link
              href={`/projects/${params.projectId}/test-plans/exploratory/${session.id}`}
              className="text-sm text-accent hover:underline"
            >
              {t('openLink')}
            </Link>
          </li>
        ))}
        {sessions?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = charter.trim();
          if (!trimmed) return;
          startSession.mutate({ charter: trimmed }, { onSuccess: () => setCharter('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="charter" className="sr-only">
          {t('charterPlaceholder')}
        </label>
        <input
          id="charter"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('charterPlaceholder')}
          value={charter}
          onChange={(e) => setCharter(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={startSession.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('start')}
        </button>
      </form>
    </div>
  );
}
