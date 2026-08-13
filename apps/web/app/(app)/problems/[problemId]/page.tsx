'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useProblem, useUpdateProblem, useLinkIncident, ProblemStatus } from '@/lib/hooks/use-problems';

const STATUSES: ProblemStatus[] = ['new', 'investigating', 'known_error', 'resolved', 'closed'];

export default function ProblemDetailPage({ params }: { params: { problemId: string } }) {
  const t = useTranslations('problems');
  const tCommon = useTranslations('common');
  const { data: problem, isLoading, error } = useProblem(params.problemId);
  const update = useUpdateProblem(params.problemId);
  const linkIncident = useLinkIncident(params.problemId);

  const [rootCause, setRootCause] = useState('');
  const [workaround, setWorkaround] = useState('');
  const [incidentId, setIncidentId] = useState('');

  return (
    <div className="mx-auto max-w-3xl">
      <Link href="/problems" className="mb-4 inline-block text-sm text-accent hover:underline">
        {t('backLink')}
      </Link>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {problem && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-xl font-semibold">{problem.title}</h1>
            <select
              className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
              value={problem.status}
              onChange={(e) => update.mutate({ status: e.target.value as ProblemStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </div>
          {problem.description && <p className="mb-6 text-sm text-text-secondary">{problem.description}</p>}

          <section className="mb-6 grid gap-4 sm:grid-cols-2">
            <div>
              <h2 className="mb-1 text-sm font-medium">{t('rootCauseLabel')}</h2>
              {problem.root_cause ? (
                <p className="text-sm text-text-secondary">{problem.root_cause}</p>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (rootCause.trim()) update.mutate({ rootCause: rootCause.trim() }, { onSuccess: () => setRootCause('') });
                  }}
                >
                  <input
                    className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                    value={rootCause}
                    onChange={(e) => setRootCause(e.target.value)}
                  />
                  <button className="rounded bg-accent px-2 py-1 text-xs text-white" type="submit">
                    {tCommon('save')}
                  </button>
                </form>
              )}
            </div>
            <div>
              <h2 className="mb-1 text-sm font-medium">{t('workaroundLabel')}</h2>
              {problem.workaround ? (
                <p className="text-sm text-text-secondary">{problem.workaround}</p>
              ) : (
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (workaround.trim()) update.mutate({ workaround: workaround.trim() }, { onSuccess: () => setWorkaround('') });
                  }}
                >
                  <input
                    className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                    value={workaround}
                    onChange={(e) => setWorkaround(e.target.value)}
                  />
                  <button className="rounded bg-accent px-2 py-1 text-xs text-white" type="submit">
                    {tCommon('save')}
                  </button>
                </form>
              )}
            </div>
          </section>

          <section>
            <h2 className="mb-2 text-sm font-medium">{t('linkedIncidentsHeading')}</h2>
            <ul className="mb-3 divide-y divide-border rounded border border-border">
              {problem.linkedIncidents.map((i) => (
                <li key={i.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <span>{i.title}</span>
                  <span className="text-xs text-text-secondary">
                    {i.severity} · {i.status}
                  </span>
                </li>
              ))}
              {problem.linkedIncidents.length === 0 && (
                <li className="px-3 py-2 text-xs text-text-secondary">{t('noLinkedIncidents')}</li>
              )}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (incidentId.trim()) linkIncident.mutate({ incidentId: incidentId.trim() }, { onSuccess: () => setIncidentId('') });
              }}
            >
              <input
                className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                placeholder={t('incidentIdPlaceholder')}
                value={incidentId}
                onChange={(e) => setIncidentId(e.target.value)}
              />
              <button className="rounded bg-accent px-3 py-1 text-sm text-white" type="submit">
                {t('linkIncident')}
              </button>
            </form>
          </section>
        </>
      )}
    </div>
  );
}
