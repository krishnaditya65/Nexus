'use client';

// Renders one dashboard widget by calling the same endpoint a dedicated
// screen for that data source already calls — see dashboards.service.ts's
// docblock for why widgets hold config, not data. Each case below is a
// thin wrapper around an existing hook; no new backend aggregation.
import { useTranslations } from 'next-intl';
import { Widget } from '@/lib/hooks/use-dashboards';
import { useAllTickets, useVelocityTrend } from '@/lib/hooks/use-backlog';
import { useBurndown } from '@/lib/hooks/use-bi';
import { usePullRequests } from '@/lib/hooks/use-repos';
import { useFlakyTests } from '@/lib/hooks/use-qa';
import { useTeamPlan } from '@/lib/hooks/use-team-planner';

function TicketCountsByStateWidget({ projectId }: { projectId: string }) {
  const tCommon = useTranslations('common');
  const { data: tickets, isLoading, error } = useAllTickets(projectId);
  if (isLoading) return <p className="text-xs text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;

  const counts = new Map<string, number>();
  for (const t of tickets ?? []) counts.set(t.state_name, (counts.get(t.state_name) ?? 0) + 1);

  return (
    <ul className="space-y-1 text-sm">
      {Array.from(counts.entries()).map(([state, count]) => (
        <li key={state} className="flex items-center justify-between">
          <span>{state}</span>
          <span className="font-medium">{count}</span>
        </li>
      ))}
      {counts.size === 0 && <li className="text-xs text-text-secondary">—</li>}
    </ul>
  );
}

// A minimal inline SVG sparkline — no charting library dependency for one
// two-line chart. Not a general-purpose chart component, just enough to
// make a burndown widget visually legible at dashboard-card size.
function BurndownSparkline({ sprintId }: { sprintId: string }) {
  const tCommon = useTranslations('common');
  const { data, isLoading, error } = useBurndown(sprintId);
  if (isLoading) return <p className="text-xs text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;
  if (!data || data.series.length === 0) return <p className="text-xs text-text-secondary">{tCommon('none')}</p>;

  const width = 240;
  const height = 80;
  const max = data.totalPoints || 1;
  const toPoints = (key: 'idealRemaining' | 'actualRemaining') =>
    data.series
      .map((p, i) => {
        const x = (i / Math.max(1, data.series.length - 1)) * width;
        const y = height - (p[key] / max) * height;
        return `${x},${y}`;
      })
      .join(' ');

  const latest = data.series[data.series.length - 1];

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Sprint burndown chart">
        <polyline points={toPoints('idealRemaining')} fill="none" stroke="currentColor" strokeOpacity={0.3} strokeWidth={2} />
        <polyline points={toPoints('actualRemaining')} fill="none" stroke="currentColor" strokeWidth={2} />
      </svg>
      <p className="mt-1 text-xs text-text-secondary">
        {latest.actualRemaining} / {data.totalPoints} pts remaining
      </p>
    </div>
  );
}

function OpenPullRequestsWidget({ repoName }: { repoName: string }) {
  const tCommon = useTranslations('common');
  const { data: pulls, isLoading, error } = usePullRequests(repoName);
  if (isLoading) return <p className="text-xs text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;
  const open = pulls?.filter((p) => p.status === 'open') ?? [];
  return (
    <div>
      <p className="mb-1 text-2xl font-semibold">{open.length}</p>
      <ul className="space-y-1 text-xs text-text-secondary">
        {open.slice(0, 5).map((pr) => (
          <li key={pr.id} className="truncate">{pr.title}</li>
        ))}
      </ul>
    </div>
  );
}

function FlakyTestsWidget() {
  const tCommon = useTranslations('common');
  const { data, isLoading, error } = useFlakyTests();
  if (isLoading) return <p className="text-xs text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;
  return <p className="text-2xl font-semibold">{data?.length ?? 0}</p>;
}

function TeamCapacityWidget({ sprintId }: { sprintId: string }) {
  const tCommon = useTranslations('common');
  const { data, isLoading, error } = useTeamPlan(sprintId);
  if (isLoading) return <p className="text-xs text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;
  const overallocated = data?.filter((d) => d.isOverallocated).length ?? 0;
  return (
    <div>
      <p className="text-2xl font-semibold">{overallocated}</p>
      <p className="text-xs text-text-secondary">of {data?.length ?? 0} people overallocated</p>
    </div>
  );
}

// Same "no charting library, just enough SVG to be legible at
// dashboard-card size" approach as BurndownSparkline above.
function VelocityTrendChart({ projectId }: { projectId: string }) {
  const tCommon = useTranslations('common');
  const t = useTranslations('dashboards');
  const { data, isLoading, error } = useVelocityTrend(projectId);
  if (isLoading) return <p className="text-xs text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;
  if (!data || data.length === 0) return <p className="text-xs text-text-secondary">{t('noCompletedSprints')}</p>;

  const width = 240;
  const height = 80;
  const max = Math.max(...data.map((p) => p.completedPoints), 1);
  const barWidth = width / data.length;

  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full" role="img" aria-label="Velocity trend chart">
        {data.map((p, i) => {
          const barHeight = (p.completedPoints / max) * height;
          return (
            <rect
              key={p.sprintId}
              x={i * barWidth + barWidth * 0.15}
              y={height - barHeight}
              width={barWidth * 0.7}
              height={barHeight}
              fill="currentColor"
            />
          );
        })}
      </svg>
      <p className="mt-1 text-xs text-text-secondary">
        {data[data.length - 1].sprintName}: {data[data.length - 1].completedPoints} pts
      </p>
    </div>
  );
}

export function DashboardWidget({ widget, projectId }: { widget: Widget; projectId: string }) {
  const t = useTranslations('dashboards');
  switch (widget.widget_type) {
    case 'ticket_counts_by_state':
      return <TicketCountsByStateWidget projectId={projectId} />;
    case 'sprint_burndown':
      return widget.config.sprintId ? (
        <BurndownSparkline sprintId={widget.config.sprintId} />
      ) : (
        <p className="text-xs text-danger">{t('missingConfig', { key: 'sprintId' })}</p>
      );
    case 'open_pull_requests':
      return widget.config.repoName ? (
        <OpenPullRequestsWidget repoName={widget.config.repoName} />
      ) : (
        <p className="text-xs text-danger">{t('missingConfig', { key: 'repoName' })}</p>
      );
    case 'flaky_tests':
      return <FlakyTestsWidget />;
    case 'velocity_trend':
      return <VelocityTrendChart projectId={projectId} />;
    case 'team_capacity':
      return widget.config.sprintId ? (
        <TeamCapacityWidget sprintId={widget.config.sprintId} />
      ) : (
        <p className="text-xs text-danger">{t('missingConfig', { key: 'sprintId' })}</p>
      );
    default:
      return <p className="text-xs text-danger">{t('unknownWidgetType', { type: widget.widget_type })}</p>;
  }
}
