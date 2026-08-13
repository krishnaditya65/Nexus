'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  FILTERABLE_FIELDS,
  OPERATORS_BY_TYPE,
  Filter,
  ViewType,
  useSavedQueries,
  useSaveQuery,
  useDeleteQuery,
  useExecuteQuery,
  useExecuteSavedQuery,
} from '@/lib/hooks/use-queries';
import { Cadence, useSubscriptions, useCreateSubscription, useDeleteSubscription } from '@/lib/hooks/use-subscriptions';

const VIEW_TYPES: ViewType[] = ['list', 'calendar', 'table', 'workload'];
const CADENCES: Cadence[] = ['hourly', 'daily', 'weekly'];

const emptyFilter = (): Filter => ({ field: FILTERABLE_FIELDS[0].field, operator: 'equals', value: '' });

export default function QueriesPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('queries');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const [filters, setFilters] = useState<Filter[]>([emptyFilter()]);
  const [queryName, setQueryName] = useState('');
  const [saveViewType, setSaveViewType] = useState<ViewType>('list');

  const { data: savedQueries } = useSavedQueries(projectId);
  const saveQuery = useSaveQuery(projectId);
  const deleteQuery = useDeleteQuery(projectId);
  const executeQuery = useExecuteQuery(projectId);
  const executeSavedQuery = useExecuteSavedQuery(projectId);
  const { data: subscriptions } = useSubscriptions();
  const createSubscription = useCreateSubscription();
  const deleteSubscription = useDeleteSubscription();

  const results = executeQuery.data ?? executeSavedQuery.data;
  const isRunning = executeQuery.isPending || executeSavedQuery.isPending;

  function fieldType(fieldName: string) {
    return FILTERABLE_FIELDS.find((f) => f.field === fieldName)?.type ?? 'text';
  }

  function updateFilter(index: number, patch: Partial<Filter>) {
    setFilters((prev) => prev.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  }

  function runFilters() {
    executeSavedQuery.reset();
    executeQuery.mutate(filters);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      <section className="mb-6 rounded border border-border p-4">
        <h2 className="mb-3 text-sm font-medium text-text-secondary">{t('builderHeading')}</h2>
        {filters.map((filter, i) => {
          const type = fieldType(filter.field);
          const operators = OPERATORS_BY_TYPE[type];
          const needsValue = !['isEmpty', 'isNotEmpty'].includes(filter.operator);
          return (
            <div key={i} className="mb-2 flex items-center gap-2">
              <select
                className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                value={filter.field}
                onChange={(e) => {
                  const newType = fieldType(e.target.value);
                  updateFilter(i, { field: e.target.value, operator: OPERATORS_BY_TYPE[newType][0].operator });
                }}
              >
                {FILTERABLE_FIELDS.map((f) => (
                  <option key={f.field} value={f.field}>
                    {t(f.labelKey)}
                  </option>
                ))}
              </select>
              <select
                className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                value={filter.operator}
                onChange={(e) => updateFilter(i, { operator: e.target.value })}
              >
                {operators.map((op) => (
                  <option key={op.operator} value={op.operator}>
                    {t(op.labelKey)}
                  </option>
                ))}
              </select>
              {needsValue && (
                <input
                  className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
                  value={filter.value ?? ''}
                  onChange={(e) => updateFilter(i, { value: e.target.value })}
                  placeholder={t('valuePlaceholder')}
                />
              )}
              <button
                className="text-xs text-danger hover:underline"
                onClick={() => setFilters((prev) => prev.filter((_, idx) => idx !== i))}
              >
                {t('removeFilter')}
              </button>
            </div>
          );
        })}
        <div className="mt-3 flex items-center gap-3">
          <button
            className="rounded border border-border px-3 py-1 text-sm hover:bg-surface-raised"
            onClick={() => setFilters((prev) => [...prev, emptyFilter()])}
          >
            {t('addFilter')}
          </button>
          <button
            className="rounded bg-accent px-3 py-1 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            onClick={runFilters}
            disabled={isRunning}
          >
            {t('run')}
          </button>
        </div>

        <div className="mt-4 flex items-center gap-2 border-t border-border pt-3">
          <label htmlFor="query-name" className="sr-only">
            {t('nameLabel')}
          </label>
          <input
            id="query-name"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-sm"
            placeholder={t('namePlaceholder')}
            value={queryName}
            onChange={(e) => setQueryName(e.target.value)}
          />
          <select
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
            value={saveViewType}
            onChange={(e) => setSaveViewType(e.target.value as ViewType)}
            title={t('viewTypeLabel')}
          >
            {VIEW_TYPES.map((vt) => (
              <option key={vt} value={vt}>
                {t(`view_${vt}` as 'view_list')}
              </option>
            ))}
          </select>
          <button
            className="rounded border border-border px-3 py-1 text-sm hover:bg-surface-raised disabled:opacity-50"
            disabled={!queryName.trim() || saveQuery.isPending}
            onClick={() =>
              saveQuery.mutate({ name: queryName, filters, viewType: saveViewType }, { onSuccess: () => setQueryName('') })
            }
          >
            {t('saveQuery')}
          </button>
        </div>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('savedHeading')}</h2>
        <ul className="divide-y divide-border rounded border border-border">
          {savedQueries?.map((q) => (
            <li key={q.id} className="flex items-center justify-between px-4 py-2">
              <button
                className="text-sm text-accent hover:underline"
                onClick={() => {
                  executeQuery.reset();
                  executeSavedQuery.mutate(q.id);
                  setFilters(q.filters);
                }}
              >
                {q.name}
              </button>
              <span className="flex items-center gap-2">
                <select
                  className="rounded border border-border bg-surface-raised px-1 py-0.5 text-xs"
                  defaultValue="daily"
                  onChange={(e) =>
                    createSubscription.mutate({ queryId: q.id, projectId, cadence: e.target.value as Cadence })
                  }
                  value=""
                >
                  <option value="" disabled>
                    {t('subscribeAction')}
                  </option>
                  {CADENCES.map((c) => (
                    <option key={c} value={c}>
                      {t(`cadence.${c}`)}
                    </option>
                  ))}
                </select>
                <button className="text-xs text-danger hover:underline" onClick={() => deleteQuery.mutate(q.id)}>
                  {tCommon('cancel')}
                </button>
              </span>
            </li>
          ))}
          {savedQueries?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptySaved')}</li>}
        </ul>
      </section>

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('subscriptionsHeading')}</h2>
        <ul className="divide-y divide-border rounded border border-border">
          {subscriptions?.map((s) => (
            <li key={s.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>
                {s.query_name} — {t(`cadence.${s.cadence}`)}
                {s.last_run_at && (
                  <span className="ml-2 text-xs text-text-secondary">
                    {t('lastRun', { date: new Date(s.last_run_at).toLocaleString() })}
                  </span>
                )}
              </span>
              <button className="text-xs text-danger hover:underline" onClick={() => deleteSubscription.mutate({ id: s.id })}>
                {tCommon('cancel')}
              </button>
            </li>
          ))}
          {subscriptions?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptySubscriptions')}</li>}
        </ul>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('resultsHeading')}</h2>
        {isRunning && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {(executeQuery.error || executeSavedQuery.error) && (
          <p className="text-danger">
            {tCommon('errorGeneric', { message: (executeQuery.error ?? executeSavedQuery.error)?.message ?? '' })}
          </p>
        )}
        {results && (
          <ul className="divide-y divide-border rounded border border-border">
            {results.map((ticket) => (
              <li key={ticket.id} className="flex items-center justify-between px-4 py-2">
                <span className="text-sm">
                  <span className="font-mono text-text-secondary">#{ticket.ticket_number}</span> {ticket.title}
                </span>
                <span className="rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
                  {ticket.state_name}
                </span>
              </li>
            ))}
            {results.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyResults')}</li>}
          </ul>
        )}
      </section>
    </div>
  );
}
