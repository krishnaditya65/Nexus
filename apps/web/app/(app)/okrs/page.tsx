'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useObjectives,
  useCreateObjective,
  useSetObjectiveStatus,
  useKeyResults,
  useAddKeyResult,
  useUpdateKeyResultValue,
} from '@/lib/hooks/use-okrs';

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-raised">
      <div
        className="h-full rounded-full bg-accent transition-all"
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </div>
  );
}

function KeyResultsList({ objectiveId }: { objectiveId: string }) {
  const t = useTranslations('okrs');
  const { data: keyResults } = useKeyResults(objectiveId);
  const addKeyResult = useAddKeyResult(objectiveId);
  const updateValue = useUpdateKeyResultValue(objectiveId);

  const [title, setTitle] = useState('');
  const [epicTicketId, setEpicTicketId] = useState('');
  const [targetValue, setTargetValue] = useState('100');
  const [unit, setUnit] = useState('%');

  return (
    <div className="mt-3 border-t border-border pt-3">
      <ul className="mb-3 space-y-3">
        {keyResults?.map((kr) => (
          <li key={kr.id} className="text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span>
                {kr.title}{' '}
                <span className="text-xs text-text-secondary">
                  ({kr.progressSource === 'epic' ? t('drivenByEpic') : `${kr.current_value}/${kr.target_value} ${kr.unit}`})
                </span>
              </span>
              <span className="text-xs font-medium">{kr.progressPercent}%</span>
            </div>
            <ProgressBar percent={kr.progressPercent} />
            {kr.progressSource === 'manual' && (
              <form
                className="mt-1 flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const input = (e.target as HTMLFormElement).elements.namedItem('value') as HTMLInputElement;
                  updateValue.mutate({ id: kr.id, currentValue: Number(input.value) });
                  input.value = '';
                }}
              >
                <input
                  name="value"
                  type="number"
                  step="0.01"
                  className="w-24 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                  placeholder={t('updateValuePlaceholder')}
                />
                <button type="submit" className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised">
                  {t('update')}
                </button>
              </form>
            )}
          </li>
        ))}
        {keyResults?.length === 0 && <p className="text-xs text-text-secondary">{t('emptyKeyResults')}</p>}
      </ul>
      <form
        className="flex flex-wrap gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          addKeyResult.mutate(
            {
              title,
              epicTicketId: epicTicketId || undefined,
              targetValue: epicTicketId ? undefined : Number(targetValue),
              unit: epicTicketId ? undefined : unit,
            },
            { onSuccess: () => { setTitle(''); setEpicTicketId(''); setTargetValue('100'); setUnit('%'); } },
          );
        }}
      >
        <input
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
          placeholder={t('keyResultTitlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          className="w-40 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
          placeholder={t('epicIdPlaceholder')}
          value={epicTicketId}
          onChange={(e) => setEpicTicketId(e.target.value)}
        />
        {!epicTicketId && (
          <>
            <input
              type="number"
              className="w-20 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
            />
            <input
              className="w-20 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
            />
          </>
        )}
        <button
          type="submit"
          disabled={addKeyResult.isPending}
          className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('addKeyResult')}
        </button>
      </form>
      {addKeyResult.isError && <p className="mt-1 text-xs text-danger">{addKeyResult.error.message}</p>}
    </div>
  );
}

export default function OkrsPage() {
  const t = useTranslations('okrs');
  const tCommon = useTranslations('common');
  const { data: objectives, isLoading, error } = useObjectives();
  const createObjective = useCreateObjective();
  const setStatus = useSetObjectiveStatus();

  const [title, setTitle] = useState('');
  const [period, setPeriod] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-6 space-y-3">
        {objectives?.map((obj) => (
          <li key={obj.id} className="rounded border border-border bg-surface-raised p-4">
            <div className="flex items-center justify-between">
              <div>
                <button
                  onClick={() => setExpanded(expanded === obj.id ? null : obj.id)}
                  className="text-left font-medium hover:text-accent"
                >
                  {obj.title}
                </button>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {obj.period} · {obj.status}
                </p>
              </div>
              <select
                value={obj.status}
                onChange={(e) =>
                  setStatus.mutate({ id: obj.id, status: e.target.value as 'active' | 'completed' | 'abandoned' })
                }
                className="rounded border border-border bg-surface px-2 py-1 text-xs"
              >
                <option value="active">{t('statusActive')}</option>
                <option value="completed">{t('statusCompleted')}</option>
                <option value="abandoned">{t('statusAbandoned')}</option>
              </select>
            </div>
            {expanded === obj.id && <KeyResultsList objectiveId={obj.id} />}
          </li>
        ))}
        {objectives?.length === 0 && <p className="text-text-secondary">{t('emptyObjectives')}</p>}
      </ul>

      <form
        className="flex flex-wrap gap-2 rounded border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          createObjective.mutate({ title, period }, { onSuccess: () => { setTitle(''); setPeriod(''); } });
        }}
      >
        <input
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('objectiveTitlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          required
        />
        <input
          className="w-32 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('periodPlaceholder')}
          value={period}
          onChange={(e) => setPeriod(e.target.value)}
          required
        />
        <button
          type="submit"
          disabled={createObjective.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('createObjective')}
        </button>
      </form>
    </div>
  );
}
