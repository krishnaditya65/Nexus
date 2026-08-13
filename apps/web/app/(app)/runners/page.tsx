'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRunners, useRegisterRunner, useRemoveRunner } from '@/lib/hooks/use-runners';

export default function RunnersPage() {
  const t = useTranslations('runners');
  const tCommon = useTranslations('common');
  const { data: runners, isLoading, error } = useRunners();
  const registerRunner = useRegisterRunner();
  const removeRunner = useRemoveRunner();

  const [name, setName] = useState('');
  const [labels, setLabels] = useState('');
  const [justRegisteredToken, setJustRegisteredToken] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const labelList = labels
      .split(',')
      .map((l) => l.trim())
      .filter(Boolean);
    registerRunner.mutate(
      { name, labels: labelList },
      {
        onSuccess: (runner) => {
          setJustRegisteredToken(runner.token);
          setName('');
          setLabels('');
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {justRegisteredToken && (
        <div className="mb-6 rounded border border-accent bg-accent/10 p-3">
          <p className="mb-1 text-sm font-medium">{t('tokenShownOnce')}</p>
          <code className="block overflow-x-auto rounded bg-surface p-2 text-xs">{justRegisteredToken}</code>
          <button
            onClick={() => setJustRegisteredToken(null)}
            className="mt-2 text-xs text-accent hover:underline"
          >
            {tCommon('dismiss')}
          </button>
        </div>
      )}

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {runners?.map((runner) => (
          <li key={runner.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-medium">{runner.name}</span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    runner.status === 'online' ? 'bg-success/20 text-success' : 'bg-surface-raised text-text-secondary'
                  }`}
                >
                  {runner.status === 'online' ? t('online') : t('offline')}
                </span>
              </div>
              <p className="mt-1 flex flex-wrap gap-1">
                {runner.labels.map((label) => (
                  <span key={label} className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">
                    {label}
                  </span>
                ))}
              </p>
              {runner.last_heartbeat_at && (
                <p className="mt-1 text-xs text-text-secondary">
                  {t('lastHeartbeat', { date: new Date(runner.last_heartbeat_at).toLocaleString() })}
                </p>
              )}
            </div>
            <button
              onClick={() => removeRunner.mutate(runner.id)}
              disabled={removeRunner.isPending}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
            >
              {t('deregister')}
            </button>
          </li>
        ))}
        {runners?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form onSubmit={submit} className="space-y-2 rounded border border-border p-4">
        <h2 className="text-sm font-medium">{t('registerHeading')}</h2>
        <label htmlFor="runner-name" className="sr-only">
          {t('nameLabel')}
        </label>
        <input
          id="runner-name"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label htmlFor="runner-labels" className="sr-only">
          {t('labelsLabel')}
        </label>
        <input
          id="runner-labels"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('labelsPlaceholder')}
          value={labels}
          onChange={(e) => setLabels(e.target.value)}
        />
        <p className="text-xs text-text-secondary">{t('labelsHint')}</p>
        {registerRunner.isError && <p className="text-xs text-danger">{registerRunner.error.message}</p>}
        <button
          type="submit"
          disabled={registerRunner.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('register')}
        </button>
      </form>
    </div>
  );
}
