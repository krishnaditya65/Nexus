'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useWebhooks, useCreateWebhook, CreatedWebhook } from '@/lib/hooks/use-webhooks';
import { SettingsNav } from '@/components/settings-nav';

const EVENT_TYPES = ['ticket.created', 'ticket.transitioned', 'pull_request.opened', 'pull_request.merged', 'deployment.deployed'];

export default function ServiceHooksSettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { data: hooks, isLoading, error } = useWebhooks();
  const createWebhook = useCreateWebhook();

  const [targetUrl, setTargetUrl] = useState('');
  const [selectedEvents, setSelectedEvents] = useState<string[]>([]);
  const [lastCreated, setLastCreated] = useState<CreatedWebhook | null>(null);

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('serviceHooksTitle')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('serviceHooksSubtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {lastCreated && (
        <div role="alert" className="mb-4 rounded border border-warn bg-warn/10 p-3 text-xs">
          <p className="mb-1 font-medium">{t('secretShownOnce')}</p>
          <code className="break-all">{lastCreated.signingSecret}</code>
        </div>
      )}

      <ul className="mb-6 divide-y divide-border rounded border border-border">
        {hooks?.map((h) => (
          <li key={h.id} className="px-4 py-3 text-sm">
            <p className="font-mono">{h.target_url}</p>
            <p className="mt-1 text-xs text-text-secondary">{h.event_types.join(', ')}</p>
          </li>
        ))}
        {hooks?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyServiceHooks')}</li>}
      </ul>

      <form
        className="rounded border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!targetUrl.trim() || selectedEvents.length === 0) return;
          createWebhook.mutate(
            { targetUrl, eventTypes: selectedEvents },
            {
              onSuccess: (created) => {
                setLastCreated(created);
                setTargetUrl('');
                setSelectedEvents([]);
              },
            },
          );
        }}
      >
        <label htmlFor="hook-url" className="mb-1 block text-xs font-medium text-text-secondary">
          {t('targetUrlLabel')}
        </label>
        <input
          id="hook-url"
          type="url"
          className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder="https://example.com/webhook"
          value={targetUrl}
          onChange={(e) => setTargetUrl(e.target.value)}
          required
        />
        <p className="mb-1 text-xs font-medium text-text-secondary">{t('eventTypesLabel')}</p>
        <div className="mb-3 flex flex-wrap gap-3">
          {EVENT_TYPES.map((evt) => (
            <label key={evt} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={selectedEvents.includes(evt)}
                onChange={(e) =>
                  setSelectedEvents((prev) => (e.target.checked ? [...prev, evt] : prev.filter((x) => x !== evt)))
                }
              />
              {evt}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={createWebhook.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('createServiceHook')}
        </button>
      </form>
    </div>
  );
}
