'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useGoals,
  useCreateGoal,
  useUpdateGoalValue,
  useSetGoalStatus,
  useDeleteGoal,
  type GoalType,
} from '@/lib/hooks/use-goals';

const GOAL_TYPES: GoalType[] = ['numeric', 'currency', 'task_count'];

export default function GoalsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('goals');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: goals, isLoading } = useGoals(projectId);
  const createGoal = useCreateGoal(projectId);
  const updateValue = useUpdateGoalValue(projectId);
  const setStatus = useSetGoalStatus(projectId);
  const deleteGoal = useDeleteGoal(projectId);

  const [name, setName] = useState('');
  const [goalType, setGoalType] = useState<GoalType>('numeric');
  const [targetValue, setTargetValue] = useState('');
  const [unit, setUnit] = useState('');
  const [valueDrafts, setValueDrafts] = useState<Record<string, string>>({});

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const target = Number(targetValue);
    if (!name.trim() || !target) return;
    createGoal.mutate(
      { name, goalType, targetValue: target, unit: unit.trim() || undefined },
      { onSuccess: () => { setName(''); setTargetValue(''); setUnit(''); } },
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <form onSubmit={submit} className="mb-6 space-y-3 rounded border border-border p-4">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('nameLabel')}</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('typeLabel')}</label>
            <select
              value={goalType}
              onChange={(e) => setGoalType(e.target.value as GoalType)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {GOAL_TYPES.map((gt) => (
                <option key={gt} value={gt}>
                  {t(`type_${gt}`)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('targetLabel')}</label>
            <input
              type="number"
              value={targetValue}
              onChange={(e) => setTargetValue(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('unitLabel')}</label>
            <input
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              placeholder={t('unitPlaceholder')}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            />
          </div>
        </div>
        {createGoal.isError && <p className="text-xs text-danger">{createGoal.error.message}</p>}
        <button
          type="submit"
          disabled={createGoal.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="space-y-3">
        {goals?.map((g) => (
          <li key={g.id} className="rounded border border-border p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-medium">{g.name}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  g.status === 'achieved'
                    ? 'bg-success/20 text-success'
                    : g.status === 'archived'
                      ? 'bg-surface-raised text-text-secondary'
                      : 'bg-accent/20 text-accent'
                }`}
              >
                {t(`status_${g.status}`)}
              </span>
            </div>
            <div className="mb-2 h-2 overflow-hidden rounded-full bg-surface-raised">
              <div
                className={`h-full ${g.status === 'achieved' ? 'bg-success' : 'bg-accent'}`}
                style={{ width: `${g.progressPercent}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-text-secondary">
              <span>
                {g.current_value} / {g.target_value} {g.unit} ({g.progressPercent}%)
              </span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  placeholder={t('newValuePlaceholder')}
                  value={valueDrafts[g.id] ?? ''}
                  onChange={(e) => setValueDrafts((v) => ({ ...v, [g.id]: e.target.value }))}
                  className="w-24 rounded border border-border bg-surface px-2 py-1 text-xs"
                />
                <button
                  onClick={() => {
                    const v = Number(valueDrafts[g.id]);
                    if (!isNaN(v)) updateValue.mutate({ id: g.id, currentValue: v });
                  }}
                  disabled={updateValue.isPending}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
                >
                  {t('updateValue')}
                </button>
                {g.status !== 'archived' && (
                  <button
                    onClick={() => setStatus.mutate({ id: g.id, status: 'archived' })}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
                  >
                    {t('archive')}
                  </button>
                )}
                <button
                  onClick={() => deleteGoal.mutate(g.id)}
                  className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10"
                >
                  {tCommon('remove')}
                </button>
              </div>
            </div>
          </li>
        ))}
        {goals?.length === 0 && <li className="text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
