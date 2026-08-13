'use client';

import { useTranslations } from 'next-intl';
import { useEpicRollups } from '@/lib/hooks/use-roadmap';

/** Roadmap/Gantt timeline view for epics (docs/FEATURES.md §13.4/§11.2) —
 *  the epic-level date-range visualization that was the flagged gap:
 *  epic progress rollup (`EpicsService.rollupAllEpics`) already existed,
 *  but nothing plotted `due_date` on a timeline. Reuses the exact
 *  hand-rolled proportional-bar approach the delivery-plan detail page
 *  already uses for sprint lanes (no charting library, same visual
 *  language) — this page is that same idea one level up, at epic
 *  granularity instead of sprint granularity.
 *
 *  "Start" is `created_at` (schema has no dedicated `tickets.start_date`
 *  column — see EpicsService's docblock) — an honest approximation, not a
 *  true planned-start date. An epic with no `due_date` set can't be
 *  plotted at all and is listed separately, same "scheduled vs
 *  unscheduled" split as the delivery-plan page. */
export default function RoadmapPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('roadmap');
  const tCommon = useTranslations('common');
  const { data: epics, isLoading, error } = useEpicRollups(params.projectId);

  const scheduled = (epics ?? []).filter((e) => e.dueDate);
  const unscheduled = (epics ?? []).filter((e) => !e.dueDate);

  let minTime = 0;
  let maxTime = 1;
  if (scheduled.length > 0) {
    const starts = scheduled.map((e) => new Date(e.createdAt).getTime());
    const ends = scheduled.map((e) => new Date(e.dueDate!).getTime());
    minTime = Math.min(...starts);
    maxTime = Math.max(...ends, minTime + 1);
  }
  const span = Math.max(maxTime - minTime, 1);
  const todayPct = ((Date.now() - minTime) / span) * 100;

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {epics && (
        <>
          <div className="mb-8 space-y-2">
            {scheduled.map((epic) => {
              const start = new Date(epic.createdAt).getTime();
              const end = new Date(epic.dueDate!).getTime();
              const startPct = ((start - minTime) / span) * 100;
              const widthPct = Math.max(((end - start) / span) * 100, 1);
              const overdue = end < Date.now() && epic.percentCompleteByCount < 100;
              return (
                <div key={epic.epicId} className="flex items-center gap-2 text-xs">
                  <span className="w-40 shrink-0 truncate text-text-secondary" title={epic.epicTitle}>
                    {epic.epicTitle}
                  </span>
                  <div className="relative h-5 flex-1 rounded bg-surface">
                    {todayPct >= 0 && todayPct <= 100 && (
                      <div className="absolute h-5 w-px bg-danger" style={{ left: `${todayPct}%` }} title={t('todayMarker')} />
                    )}
                    <div
                      className={`absolute h-5 rounded ${overdue ? 'bg-danger' : 'bg-accent'}`}
                      style={{ left: `${startPct}%`, width: `${widthPct}%` }}
                      title={`${epic.epicTitle}: ${epic.createdAt.slice(0, 10)} → ${epic.dueDate}`}
                    />
                  </div>
                  <span className="w-24 shrink-0 text-text-secondary">
                    {t('percentComplete', { percent: epic.percentCompleteByCount })}
                  </span>
                </div>
              );
            })}
            {scheduled.length === 0 && <p className="text-text-secondary">{t('emptyScheduled')}</p>}
          </div>

          {unscheduled.length > 0 && (
            <div>
              <h2 className="mb-1 text-sm font-medium">{t('unscheduledTitle')}</h2>
              <p className="mb-2 text-xs text-text-secondary">{t('unscheduledSubtitle')}</p>
              <ul className="divide-y divide-border rounded border border-border">
                {unscheduled.map((epic) => (
                  <li key={epic.epicId} className="flex items-center justify-between px-4 py-2 text-sm">
                    <span>{epic.epicTitle}</span>
                    <span className="text-xs text-text-secondary">
                      {t('percentComplete', { percent: epic.percentCompleteByCount })}
                    </span>
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
