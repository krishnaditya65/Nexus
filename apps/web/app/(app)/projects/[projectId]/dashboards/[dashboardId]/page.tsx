'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useDashboard, useAddWidget, useRemoveWidget, WidgetType } from '@/lib/hooks/use-dashboards';
import { useSprints } from '@/lib/hooks/use-backlog';
import { useRepos } from '@/lib/hooks/use-repos';
import { DashboardWidget } from '@/components/dashboard-widget';

const WIDGET_TYPES: { type: WidgetType; needsConfig: 'sprintId' | 'repoName' | null }[] = [
  { type: 'ticket_counts_by_state', needsConfig: null },
  { type: 'flaky_tests', needsConfig: null },
  { type: 'velocity_trend', needsConfig: null },
  { type: 'sprint_burndown', needsConfig: 'sprintId' },
  { type: 'team_capacity', needsConfig: 'sprintId' },
  { type: 'open_pull_requests', needsConfig: 'repoName' },
];

export default function DashboardDetailPage({ params }: { params: { projectId: string; dashboardId: string } }) {
  const t = useTranslations('dashboards');
  const tCommon = useTranslations('common');
  const { projectId, dashboardId } = params;

  const { data: dashboard, isLoading, error } = useDashboard(dashboardId);
  const addWidget = useAddWidget(dashboardId);
  const removeWidget = useRemoveWidget(dashboardId);
  const { data: sprints } = useSprints(projectId);
  const { data: repos } = useRepos();

  const [widgetType, setWidgetType] = useState<WidgetType>('ticket_counts_by_state');
  const [title, setTitle] = useState('');
  const [configValue, setConfigValue] = useState('');

  const selectedSpec = WIDGET_TYPES.find((w) => w.type === widgetType)!;

  return (
    <div className="mx-auto max-w-4xl">
      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {dashboard && (
        <>
          <h1 className="mb-6 text-xl font-semibold">{dashboard.name}</h1>

          <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {dashboard.widgets.map((widget) => (
              <div key={widget.id} className="rounded border border-border bg-surface-raised p-3">
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-sm font-medium">{widget.title}</h2>
                  <button className="text-xs text-danger hover:underline" onClick={() => removeWidget.mutate(widget.id)}>
                    {tCommon('cancel')}
                  </button>
                </div>
                <DashboardWidget widget={widget} projectId={projectId} />
              </div>
            ))}
            {dashboard.widgets.length === 0 && (
              <p className="text-sm text-text-secondary">{t('emptyWidgets')}</p>
            )}
          </div>

          <form
            className="flex flex-wrap items-center gap-2 rounded border border-border p-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!title.trim()) return;
              const config: Record<string, string> = {};
              if (selectedSpec.needsConfig && configValue) config[selectedSpec.needsConfig] = configValue;
              addWidget.mutate(
                { widgetType, title, config },
                { onSuccess: () => { setTitle(''); setConfigValue(''); } },
              );
            }}
          >
            <label htmlFor="widget-type" className="sr-only">
              {t('widgetType')}
            </label>
            <select
              id="widget-type"
              className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              value={widgetType}
              onChange={(e) => { setWidgetType(e.target.value as WidgetType); setConfigValue(''); }}
            >
              {WIDGET_TYPES.map((w) => (
                <option key={w.type} value={w.type}>
                  {t(`widgetLabel_${w.type}`)}
                </option>
              ))}
            </select>

            <label htmlFor="widget-title" className="sr-only">
              {t('widgetTitleLabel')}
            </label>
            <input
              id="widget-title"
              className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              placeholder={t('widgetTitlePlaceholder')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />

            {selectedSpec.needsConfig === 'sprintId' && (
              <select
                aria-label={t('widgetConfigSprint')}
                className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
              >
                <option value="" disabled>
                  {t('widgetConfigSprint')}
                </option>
                {sprints?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
            {selectedSpec.needsConfig === 'repoName' && (
              <select
                aria-label={t('widgetConfigRepo')}
                className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
                value={configValue}
                onChange={(e) => setConfigValue(e.target.value)}
              >
                <option value="" disabled>
                  {t('widgetConfigRepo')}
                </option>
                {repos?.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            )}

            <button
              type="submit"
              disabled={addWidget.isPending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('addWidget')}
            </button>
          </form>
        </>
      )}
    </div>
  );
}
