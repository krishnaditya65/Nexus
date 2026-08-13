'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { usePortfolioCostReport } from '@/lib/hooks/use-bi';
import { usePortfolioCapacityRollup } from '@/lib/hooks/use-team-planner';

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

/** §12.9 portfolio-level rollup — every project's real cost report,
 *  summed, plus (as of the capacity fast-follow) every project's real
 *  CURRENT sprint's capacity vs allocated points, summed the same way.
 *  See CostReportService.portfolioCostReport's and
 *  TeamPlannerService.portfolioCapacityRollup's docblocks for how each
 *  rollup avoids duplicating its per-project math. */
export default function PortfolioPage() {
  const t = useTranslations('portfolio');
  const tCommon = useTranslations('common');

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [submitted, setSubmitted] = useState(false);

  const { data: report, isLoading, error } = usePortfolioCostReport(startDate, endDate, submitted);
  const { data: capacity, isLoading: capacityLoading, error: capacityError } = usePortfolioCapacityRollup();

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSubmitted(true);
        }}
        className="mb-6 flex items-end gap-3"
      >
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('startDateLabel')}</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('endDateLabel')}</label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t('run')}
        </button>
      </form>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {report && (
        <>
          <div className="mb-6 grid grid-cols-4 gap-3">
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('totalCost')}</p>
              <p className="text-lg font-semibold">{centsToDisplay(report.totalCostCents)}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('capex')}</p>
              <p className="text-lg font-semibold">{centsToDisplay(report.capexCents)}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('opex')}</p>
              <p className="text-lg font-semibold">{centsToDisplay(report.opexCents)}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('projectCount')}</p>
              <p className="text-lg font-semibold">{report.projectCount}</p>
            </div>
          </div>

          <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('byProjectHeading')}</h2>
          <ul className="divide-y divide-border rounded border border-border">
            {report.byProject
              .slice()
              .sort((a, b) => b.totalCostCents - a.totalCostCents)
              .map((p) => (
                <li key={p.projectId} className="flex items-center justify-between px-4 py-2 text-sm">
                  <Link href={`/projects/${p.projectId}/budget`} className="text-accent hover:underline">
                    <span className="mr-2 rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
                      {p.projectKey}
                    </span>
                    {p.projectName}
                  </Link>
                  <span>{centsToDisplay(p.totalCostCents)}</span>
                </li>
              ))}
            {report.byProject.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
          </ul>
        </>
      )}

      <h2 className="mb-2 mt-8 text-sm font-medium text-text-secondary">{t('capacityHeading')}</h2>
      {capacityLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {capacityError && <p className="text-danger">{tCommon('errorGeneric', { message: capacityError.message })}</p>}
      {capacity && (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('totalCapacity')}</p>
              <p className="text-lg font-semibold">{capacity.totalCapacityPoints}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('totalAllocated')}</p>
              <p className="text-lg font-semibold">{capacity.totalAllocatedPoints}</p>
            </div>
            <div className="rounded border border-border p-3">
              <p className="text-xs text-text-secondary">{t('projectsWithActiveSprint')}</p>
              <p className="text-lg font-semibold">
                {capacity.projectsWithActiveSprint} / {capacity.projectCount}
              </p>
            </div>
          </div>
          <ul className="divide-y divide-border rounded border border-border">
            {capacity.perProject.map((p) => (
              <li key={p.projectId} className="flex items-center justify-between px-4 py-2 text-sm">
                <Link href={`/projects/${p.projectId}/team-planner`} className="text-accent hover:underline">
                  {p.projectName}
                </Link>
                {p.sprintId ? (
                  <span>
                    {p.sprintName}: {p.allocatedPoints} / {p.capacityPoints}
                  </span>
                ) : (
                  <span className="text-text-secondary">{t('noActiveSprint')}</span>
                )}
              </li>
            ))}
            {capacity.perProject.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
          </ul>
        </>
      )}
    </div>
  );
}
