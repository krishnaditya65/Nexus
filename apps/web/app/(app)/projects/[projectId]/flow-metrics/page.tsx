'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useControlChart, useCumulativeFlow, useBurnup } from '@/lib/hooks/use-flow-metrics';
import { useSprints } from '@/lib/hooks/use-backlog';

const STATE_COLORS = ['#6b7280', '#3b82f6', '#f59e0b', '#8b5cf6', '#10b981', '#ef4444', '#ec4899'];

/** Control Chart + Cumulative Flow Diagram + Sprint Burnup (docs/FEATURES.md
 *  §13.6) — all three hand-rolled inline SVG, same "no charting library"
 *  discipline as every other chart in this codebase (dashboard sparklines,
 *  dependency graph, delivery-plans Gantt). */
export default function FlowMetricsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('flowMetrics');
  const tCommon = useTranslations('common');

  const { data: controlChart, isLoading: ccLoading } = useControlChart(params.projectId);
  const { data: cfd, isLoading: cfdLoading } = useCumulativeFlow(params.projectId);
  const { data: sprints } = useSprints(params.projectId);
  const [sprintId, setSprintId] = useState<string>('');
  const { data: burnup } = useBurnup(sprintId || null);

  const width = 480;
  const height = 200;

  // Control chart: scatter of cycleTimeDays per completed ticket, oldest
  // done-date first, with a horizontal UCL reference line.
  const ccPoints = controlChart?.points ?? [];
  const ccMax = Math.max(1, controlChart?.upperControlLimit ?? 0, ...ccPoints.map((p) => p.cycleTimeDays ?? 0));
  const ccX = (i: number) => (ccPoints.length <= 1 ? width / 2 : (i / (ccPoints.length - 1)) * width);
  const ccY = (v: number) => height - (v / ccMax) * height;

  // CFD: a stacked-area chart approximated as stacked polylines per state.
  const cfdSeries = cfd?.series ?? [];
  const cfdStates = cfd?.states ?? [];
  const cfdMax = Math.max(
    1,
    ...cfdSeries.map((day) => cfdStates.reduce((sum, s) => sum + (day.counts[s] ?? 0), 0)),
  );
  const cfdX = (i: number) => (cfdSeries.length <= 1 ? width / 2 : (i / (cfdSeries.length - 1)) * width);
  function cfdStackedYPoints(stateIndex: number) {
    return cfdSeries
      .map((day, i) => {
        const cumulative = cfdStates.slice(0, stateIndex + 1).reduce((sum, s) => sum + (day.counts[s] ?? 0), 0);
        return `${cfdX(i)},${height - (cumulative / cfdMax) * height}`;
      })
      .join(' ');
  }

  const burnupSeries = burnup?.series ?? [];
  const burnupMax = Math.max(1, ...burnupSeries.map((p) => p.scopePoints));
  const buX = (i: number) => (burnupSeries.length <= 1 ? width / 2 : (i / (burnupSeries.length - 1)) * width);
  const buY = (v: number) => height - (v / burnupMax) * height;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">{t('controlChartHeading')}</h2>
        {ccLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {controlChart && (
          <>
            <p className="mb-2 text-xs text-text-secondary">
              {t('meanCycleTime')}: {controlChart.meanCycleTimeDays} {t('days')} · {t('upperControlLimit')}:{' '}
              {controlChart.upperControlLimit} {t('days')}
            </p>
            {ccPoints.length === 0 ? (
              <p className="text-text-secondary">{t('emptyControlChart')}</p>
            ) : (
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded border border-border" role="img" aria-label="Control chart">
                <line
                  x1={0}
                  x2={width}
                  y1={ccY(controlChart.upperControlLimit)}
                  y2={ccY(controlChart.upperControlLimit)}
                  stroke="currentColor"
                  strokeOpacity={0.3}
                  strokeDasharray="4 4"
                />
                {ccPoints.map((p, i) => (
                  <circle
                    key={p.ticketId}
                    cx={ccX(i)}
                    cy={ccY(p.cycleTimeDays ?? 0)}
                    r={p.isOutlier ? 5 : 3}
                    fill={p.isOutlier ? '#ef4444' : 'currentColor'}
                  >
                    <title>
                      #{p.ticketNumber} {p.title} — {p.cycleTimeDays ?? '?'} {t('days')}
                      {p.isOutlier ? ` (${t('outlier')})` : ''}
                    </title>
                  </circle>
                ))}
              </svg>
            )}
          </>
        )}
      </section>

      <section className="mb-10">
        <h2 className="mb-2 text-lg font-semibold">{t('cfdHeading')}</h2>
        {cfdLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {cfdSeries.length === 0 ? (
          <p className="text-text-secondary">{t('emptyCfd')}</p>
        ) : (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded border border-border" role="img" aria-label="Cumulative flow diagram">
              {cfdStates.map((s, idx) => (
                <polyline
                  key={s}
                  points={cfdStackedYPoints(idx)}
                  fill="none"
                  stroke={STATE_COLORS[idx % STATE_COLORS.length]}
                  strokeWidth={2}
                />
              ))}
            </svg>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-text-secondary">
              {cfdStates.map((s, idx) => (
                <span key={s} className="flex items-center gap-1">
                  <span
                    className="inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: STATE_COLORS[idx % STATE_COLORS.length] }}
                  />
                  {s}
                </span>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-semibold">{t('burnupHeading')}</h2>
        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-text-secondary">{t('burnupSprintLabel')}</span>
          <select
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={sprintId}
            onChange={(e) => setSprintId(e.target.value)}
          >
            <option value="">{t('selectSprint')}</option>
            {sprints?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        {burnupSeries.length > 0 && (
          <>
            <svg viewBox={`0 0 ${width} ${height}`} className="w-full rounded border border-border" role="img" aria-label="Sprint burnup chart">
              <polyline
                points={burnupSeries.map((p, i) => `${buX(i)},${buY(p.scopePoints)}`).join(' ')}
                fill="none"
                stroke="currentColor"
                strokeOpacity={0.3}
                strokeWidth={2}
              />
              <polyline
                points={burnupSeries.map((p, i) => `${buX(i)},${buY(p.completedPoints)}`).join(' ')}
                fill="none"
                stroke="#10b981"
                strokeWidth={2}
              />
            </svg>
            <div className="mt-2 flex gap-4 text-xs text-text-secondary">
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full opacity-30" style={{ backgroundColor: 'currentColor' }} />
                {t('scopeLabel')}
              </span>
              <span className="flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: '#10b981' }} />
                {t('completedLabel')}
              </span>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
