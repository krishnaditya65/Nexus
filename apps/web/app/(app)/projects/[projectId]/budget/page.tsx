'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useRateCards, useSetRateCard, useCostReport } from '@/lib/hooks/use-bi';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function BudgetPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('budget');
  const tCommon = useTranslations('common');

  const { data: tenantUsers } = useTenantUsers();
  const { data: rateCards } = useRateCards();
  const setRateCard = useSetRateCard();
  const [rateUserId, setRateUserId] = useState('');
  const [rateDollars, setRateDollars] = useState('');

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [submitted, setSubmitted] = useState(false);
  const { data: report, isLoading, error } = useCostReport(params.projectId, startDate, endDate, submitted);

  function displayNameFor(userId: string) {
    return tenantUsers?.find((u) => u.id === userId)?.display_name ?? userId.slice(0, 8);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">{t('rateCardsHeading')}</h2>
        <ul className="mb-3 divide-y divide-border rounded border border-border">
          {rateCards?.map((rc) => (
            <li key={rc.user_id} className="flex items-center justify-between px-3 py-2 text-sm">
              <span>{displayNameFor(rc.user_id)}</span>
              <span className="text-text-secondary">{centsToDisplay(rc.hourly_rate_cents)}/hr</span>
            </li>
          ))}
          {rateCards?.length === 0 && <li className="px-3 py-2 text-text-secondary">{t('emptyRateCards')}</li>}
        </ul>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const cents = Math.round(Number(rateDollars) * 100);
            if (!rateUserId || !Number.isFinite(cents) || cents <= 0) return;
            setRateCard.mutate({ userId: rateUserId, hourlyRateCents: cents }, { onSuccess: () => setRateDollars('') });
          }}
          className="flex gap-2"
        >
          <label htmlFor="rate-user" className="sr-only">
            {t('userLabel')}
          </label>
          <select
            id="rate-user"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={rateUserId}
            onChange={(e) => setRateUserId(e.target.value)}
          >
            <option value="">{t('selectUser')}</option>
            {tenantUsers?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name}
              </option>
            ))}
          </select>
          <label htmlFor="rate-dollars" className="sr-only">
            {t('hourlyRateLabel')}
          </label>
          <input
            id="rate-dollars"
            type="number"
            step="0.01"
            className="w-32 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('hourlyRatePlaceholder')}
            value={rateDollars}
            onChange={(e) => setRateDollars(e.target.value)}
          />
          <button
            type="submit"
            disabled={setRateCard.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('setRate')}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-medium text-text-secondary">{t('costReportHeading')}</h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitted(true);
          }}
          className="mb-4 flex items-center gap-2"
        >
          <label htmlFor="start-date" className="sr-only">
            {t('startDateLabel')}
          </label>
          <input
            id="start-date"
            type="date"
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
          <span className="text-text-secondary">{t('to')}</span>
          <label htmlFor="end-date" className="sr-only">
            {t('endDateLabel')}
          </label>
          <input
            id="end-date"
            type="date"
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
          <button type="submit" className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover">
            {t('runReport')}
          </button>
        </form>

        {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

        {report && (
          <div className="rounded border border-border bg-surface-raised p-4">
            <p className="mb-2 text-lg font-semibold">{centsToDisplay(report.totalCostCents)}</p>
            <p className="mb-3 text-sm text-text-secondary">
              {t('capexOpexSplit', {
                capex: centsToDisplay(report.capexCents),
                opex: centsToDisplay(report.opexCents),
              })}
            </p>
            {report.uncostedMinutes > 0 && (
              <p className="mb-3 rounded border border-warn bg-warn/10 p-2 text-xs text-warn">
                {t('uncostedNotice', { minutes: report.uncostedMinutes })}
              </p>
            )}
            <ul className="divide-y divide-border">
              {report.byUser.map((u) => (
                <li key={u.userId} className="flex items-center justify-between py-1.5 text-sm">
                  <span>{displayNameFor(u.userId)}</span>
                  <span className="text-text-secondary">
                    {(u.minutes / 60).toFixed(1)}h · {centsToDisplay(u.costCents)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
