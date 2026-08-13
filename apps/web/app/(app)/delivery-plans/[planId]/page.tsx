'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeliveryPlan, DeliveryPlanLane } from '@/lib/hooks/use-delivery-plans';
import { useAutoSchedulePreview, useApplyAutoSchedule } from '@/lib/hooks/use-roadmap';

const STATUS_KEY: Record<string, string> = {
  planned: 'statusPlanned',
  active: 'statusActive',
  completed: 'statusCompleted',
};

export default function DeliveryPlanDetailPage({ params }: { params: { planId: string } }) {
  const t = useTranslations('deliveryPlans');
  const tCommon = useTranslations('common');
  const { data, isLoading, error } = useDeliveryPlan(params.planId);
  const [showAutoSchedule, setShowAutoSchedule] = useState(false);
  const { data: autoSchedule, isLoading: autoScheduleLoading } = useAutoSchedulePreview(
    showAutoSchedule ? params.planId : null,
  );
  const applyAutoSchedule = useApplyAutoSchedule(params.planId);

  const scheduled = data?.lanes.filter((l) => l.scheduled) ?? [];
  const unscheduled = data?.lanes.filter((l) => !l.scheduled) ?? [];

  // Proportional bar positions within the plan's own min/max date range —
  // no charting library, same hand-rolled-visualization approach as the
  // burndown sparkline and velocity bar chart.
  let minTime = 0;
  let maxTime = 1;
  if (scheduled.length > 0) {
    const starts = scheduled.map((l) => new Date(l.startDate!).getTime());
    const ends = scheduled.map((l) => new Date(l.endDate!).getTime());
    minTime = Math.min(...starts);
    maxTime = Math.max(...ends);
  }
  const span = Math.max(maxTime - minTime, 1);

  return (
    <div className="mx-auto max-w-4xl">
      <Link href="/delivery-plans" className="mb-4 inline-block text-sm text-accent hover:underline">
        {t('backLink')}
      </Link>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {data && (
        <>
          <h1 className="mb-1 text-xl font-semibold">{data.plan.name}</h1>

          <section className="mb-8 rounded border border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-medium">{t('autoScheduleHeading')}</h2>
              <button
                className="text-sm text-accent hover:underline"
                onClick={() => setShowAutoSchedule((v) => !v)}
              >
                {showAutoSchedule ? tCommon('cancel') : t('autoScheduleCompute')}
              </button>
            </div>
            <p className="mb-3 text-xs text-text-secondary">{t('autoScheduleSubtitle')}</p>

            {showAutoSchedule && (
              <>
                {autoScheduleLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
                {autoSchedule && (
                  <>
                    {autoSchedule.velocityPerSprint != null && (
                      <p className="mb-2 text-xs text-text-secondary">
                        {t('velocityLabel', { points: autoSchedule.velocityPerSprint, days: autoSchedule.sprintLengthDays ?? 14 })}
                      </p>
                    )}
                    {autoSchedule.warnings.map((w, i) => (
                      <p key={i} className="mb-2 text-xs text-warning">
                        ⚠ {w}
                      </p>
                    ))}
                    <ul className="mb-3 divide-y divide-border rounded border border-border">
                      {autoSchedule.schedule.map((s) => (
                        <li key={s.epicId} className="flex items-center justify-between px-3 py-2 text-sm">
                          <span>
                            {s.projectKey} · {s.epicTitle}
                          </span>
                          <span className="text-xs text-text-secondary">
                            {s.startDate} → {s.endDate}
                          </span>
                        </li>
                      ))}
                      {autoSchedule.schedule.length === 0 && (
                        <li className="px-3 py-2 text-xs text-text-secondary">{t('autoScheduleEmpty')}</li>
                      )}
                    </ul>
                    {autoSchedule.schedule.length > 0 && (
                      <button
                        className="rounded bg-primary px-3 py-1 text-sm text-white disabled:opacity-50"
                        disabled={applyAutoSchedule.isPending}
                        onClick={() => {
                          if (window.confirm(t('autoScheduleApplyConfirm'))) applyAutoSchedule.mutate({});
                        }}
                      >
                        {t('autoScheduleApply')}
                      </button>
                    )}
                    {applyAutoSchedule.isSuccess && <p className="mt-2 text-xs text-success">{t('autoScheduleApplied')}</p>}
                  </>
                )}
              </>
            )}
          </section>

          <div className="mb-8 space-y-2">
            {scheduled.map((lane) => {
              const startPct = ((new Date(lane.startDate!).getTime() - minTime) / span) * 100;
              const widthPct = Math.max(((new Date(lane.endDate!).getTime() - new Date(lane.startDate!).getTime()) / span) * 100, 1);
              return (
                <div key={lane.sprintId} className="flex items-center gap-2 text-xs">
                  <span className="w-32 shrink-0 truncate text-text-secondary" title={`${lane.projectKey} — ${lane.sprintName}`}>
                    {lane.projectKey} · {lane.sprintName}
                  </span>
                  <div className="relative h-5 flex-1 rounded bg-surface">
                    <div
                      className="absolute h-5 rounded bg-accent"
                      style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                      title={`${lane.startDate} → ${lane.endDate}`}
                    />
                  </div>
                  <span className="w-20 shrink-0 text-text-secondary">{t(STATUS_KEY[lane.status] ?? 'statusPlanned')}</span>
                </div>
              );
            })}
            {scheduled.length === 0 && unscheduled.length === 0 && (
              <p className="text-text-secondary">{t('emptyLanes')}</p>
            )}
          </div>

          {unscheduled.length > 0 && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t('unscheduledTitle')}</h2>
              <p className="mb-2 text-xs text-text-secondary">{t('unscheduledSubtitle')}</p>
              <ul className="divide-y divide-border rounded border border-border">
                {unscheduled.map((lane) => (
                  <li key={lane.sprintId} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>{lane.projectKey} · {lane.sprintName}</span>
                    <span className="text-xs text-text-secondary">{t(STATUS_KEY[lane.status] ?? 'statusPlanned')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
