'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  TRIGGER_TYPES,
  ACTION_TYPES,
  useAutomations,
  useCreateAutomation,
  useSetAutomationEnabled,
  useDeleteAutomation,
  useAutomationRuns,
} from '@/lib/hooks/use-automations';

function RunsList({ automationId }: { automationId: string }) {
  const t = useTranslations('automations');
  const { data: runs } = useAutomationRuns(automationId);
  if (!runs) return null;
  if (runs.length === 0) return <p className="mt-2 text-xs text-text-secondary">{t('noRuns')}</p>;
  return (
    <ul className="mt-2 space-y-1 border-t border-border pt-2">
      {runs.map((r) => (
        <li key={r.id} className="text-xs">
          <span className={r.status === 'succeeded' ? 'text-success' : 'text-danger'}>{r.status}</span>{' '}
          <span className="text-text-secondary">{new Date(r.ran_at).toLocaleString()}</span>
          {r.detail && <span className="text-text-secondary"> — {r.detail}</span>}
        </li>
      ))}
    </ul>
  );
}

export default function AutomationsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('automations');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: automations, isLoading } = useAutomations(projectId);
  const createAutomation = useCreateAutomation(projectId);
  const setEnabled = useSetAutomationEnabled(projectId);
  const deleteAutomation = useDeleteAutomation(projectId);

  const [name, setName] = useState('');
  const [triggerType, setTriggerType] = useState<string>(TRIGGER_TYPES[0]);
  const [toStateName, setToStateName] = useState('');
  const [staleHours, setStaleHours] = useState('4');
  const [actionType, setActionType] = useState<string>(ACTION_TYPES[0]);
  const [actionUserId, setActionUserId] = useState('');
  const [actionTransitionName, setActionTransitionName] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    createAutomation.mutate(
      {
        name,
        triggerType,
        triggerConfig:
          triggerType === 'status_changed' && toStateName
            ? { toStateName }
            : triggerType === 'stale_unassigned'
              ? { hours: Number(staleHours) || 1 }
              : {},
        actionType,
        actionConfig:
          actionType === 'assign_user'
            ? { userId: actionUserId }
            : actionType === 'transition'
              ? { transitionName: actionTransitionName }
              : {},
      },
      {
        onSuccess: () => {
          setName('');
          setToStateName('');
          setActionUserId('');
          setActionTransitionName('');
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <form onSubmit={submit} className="mb-6 space-y-3 rounded border border-border p-4">
        <div>
          <label className="mb-1 block text-sm font-medium">{t('nameLabel')}</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            placeholder={t('namePlaceholder')}
            required
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('triggerLabel')}</label>
            <select
              value={triggerType}
              onChange={(e) => setTriggerType(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {TRIGGER_TYPES.map((tt) => (
                <option key={tt} value={tt}>
                  {t(`trigger_${tt}` as 'trigger_ticket_created')}
                </option>
              ))}
            </select>
            {triggerType === 'status_changed' && (
              <input
                value={toStateName}
                onChange={(e) => setToStateName(e.target.value)}
                className="mt-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder={t('toStatePlaceholder')}
              />
            )}
            {triggerType === 'stale_unassigned' && (
              <input
                type="number"
                min={1}
                value={staleHours}
                onChange={(e) => setStaleHours(e.target.value)}
                className="mt-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder={t('staleHoursPlaceholder')}
                required
              />
            )}
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium">{t('actionLabel')}</label>
            <select
              value={actionType}
              onChange={(e) => setActionType(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
            >
              {ACTION_TYPES.map((at) => (
                <option key={at} value={at}>
                  {t(`action_${at}` as 'action_notify_watchers')}
                </option>
              ))}
            </select>
            {actionType === 'assign_user' && (
              <input
                value={actionUserId}
                onChange={(e) => setActionUserId(e.target.value)}
                className="mt-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder={t('userIdPlaceholder')}
                required
              />
            )}
            {actionType === 'transition' && (
              <input
                value={actionTransitionName}
                onChange={(e) => setActionTransitionName(e.target.value)}
                className="mt-2 w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                placeholder={t('transitionNamePlaceholder')}
                required
              />
            )}
          </div>
        </div>

        {createAutomation.isError && <p className="text-xs text-danger">{createAutomation.error.message}</p>}
        <button
          type="submit"
          disabled={createAutomation.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {automations?.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{a.name}</p>
                <p className="text-xs text-text-secondary">
                  {t(`trigger_${a.trigger_type}` as 'trigger_ticket_created')}
                  {a.trigger_config?.toStateName ? ` → "${a.trigger_config.toStateName}"` : ''}
                  {' ⇒ '}
                  {t(`action_${a.action_type}` as 'action_notify_watchers')}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={a.enabled}
                    onChange={(e) => setEnabled.mutate({ id: a.id, enabled: e.target.checked })}
                  />
                  {t('enabled')}
                </label>
                <button
                  onClick={() => setExpandedId(expandedId === a.id ? null : a.id)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
                >
                  {t('viewRuns')}
                </button>
                <button
                  onClick={() => deleteAutomation.mutate(a.id)}
                  className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10"
                >
                  {tCommon('remove')}
                </button>
              </div>
            </div>
            {expandedId === a.id && <RunsList automationId={a.id} />}
          </li>
        ))}
        {automations?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
