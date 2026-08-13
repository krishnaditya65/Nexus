'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useTestPlans, useCreateTestPlan } from '@/lib/hooks/use-qa';

export default function TestPlansPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('testPlans');
  const tCommon = useTranslations('common');
  const { data: plans, isLoading, error } = useTestPlans(params.projectId);
  const createPlan = useCreateTestPlan(params.projectId);
  const [name, setName] = useState('');
  const [releaseRef, setReleaseRef] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <div className="flex gap-4">
          <Link href={`/projects/${params.projectId}/test-plans/progress`} className="text-sm text-accent hover:underline">
            {t('progressLink')}
          </Link>
          <Link href={`/projects/${params.projectId}/test-plans/exploratory`} className="text-sm text-accent hover:underline">
            {t('exploratoryLink')}
          </Link>
        </div>
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {plans?.map((plan) => (
          <li key={plan.id} className="flex items-center justify-between px-4 py-3">
            <div>
              {plan.name}
              {plan.release && (
                <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-text-secondary">
                  {plan.release.name} · {plan.release.status}
                </span>
              )}
            </div>
            <Link href={`/projects/${params.projectId}/test-plans/${plan.id}`} className="text-sm text-accent hover:underline">
              {t('casesLink')}
            </Link>
          </li>
        ))}
        {plans?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createPlan.mutate({ name, releaseRef: releaseRef || undefined }, { onSuccess: () => setName('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="plan-name" className="sr-only">
          {t('namePlaceholder')}
        </label>
        <input
          id="plan-name"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label htmlFor="plan-release-ref" className="sr-only">
          {t('releaseRefPlaceholder')}
        </label>
        <input
          id="plan-release-ref"
          className="w-40 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('releaseRefPlaceholder')}
          value={releaseRef}
          onChange={(e) => setReleaseRef(e.target.value)}
        />
        <button
          type="submit"
          disabled={createPlan.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
      {createPlan.isError && (
        <p role="alert" className="mt-2 text-xs text-danger">
          {createPlan.error.message}
        </p>
      )}
    </div>
  );
}
