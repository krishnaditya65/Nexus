'use client';

import { useTranslations } from 'next-intl';
import { useTestPlansProgress } from '@/lib/hooks/use-qa';

export default function TestPlansProgressPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('testPlans');
  const tCommon = useTranslations('common');
  const { data: plans, isLoading, error } = useTestPlansProgress(params.projectId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">{t('progressTitle')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="space-y-3">
        {plans?.map((plan) => {
          const passedPct = plan.total > 0 ? (plan.passed / plan.total) * 100 : 0;
          const failedPct = plan.total > 0 ? (plan.failed / plan.total) * 100 : 0;
          return (
            <li key={plan.planId} className="rounded border border-border bg-surface-raised p-3">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium">{plan.planName}</span>
                <span className="text-text-secondary">
                  {t('progressCounts', { passed: plan.passed, failed: plan.failed, untested: plan.untested, total: plan.total })}
                </span>
              </div>
              <div className="flex h-2 overflow-hidden rounded bg-surface" role="img" aria-label={plan.planName}>
                <div className="bg-success" style={{ width: `${passedPct}%` }} />
                <div className="bg-danger" style={{ width: `${failedPct}%` }} />
              </div>
            </li>
          );
        })}
        {plans?.length === 0 && <li className="text-text-secondary">{t('emptyProgress')}</li>}
      </ul>
    </div>
  );
}
