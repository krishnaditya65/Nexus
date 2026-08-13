'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useConnectorTypes,
  useConnectors,
  useInstallConnector,
  useSetConnectorStatus,
  useRemoveConnector,
  useSyncConnector,
  useConnectorSyncRuns,
  ConnectorType,
} from '@/lib/hooks/use-connectors';
import { SettingsNav } from '@/components/settings-nav';

export default function ConnectorsSettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { data: types, isLoading: typesLoading } = useConnectorTypes();
  const { data: installs, isLoading: installsLoading, error } = useConnectors();
  const install = useInstallConnector();
  const setStatus = useSetConnectorStatus();
  const remove = useRemoveConnector();
  const sync = useSyncConnector();

  const [installingType, setInstallingType] = useState<ConnectorType | null>(null);
  const [form, setForm] = useState<{ name: string; config: Record<string, string>; credential: string }>({
    name: '',
    config: {},
    credential: '',
  });
  const [expandedRuns, setExpandedRuns] = useState<string | null>(null);
  const { data: runs } = useConnectorSyncRuns(expandedRuns);

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('connectorsTitle')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('connectorsSubtitle')}</p>

      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('installedConnectors')}</h2>
      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {installsLoading && <li className="px-4 py-3 text-text-secondary">{tCommon('loading')}</li>}
        {installs?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyConnectors')}</li>}
        {installs?.map((i) => (
          <li key={i.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">
                  {i.name} <span className="text-xs text-text-secondary">({i.connector_type_id})</span>
                </p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {i.status === 'active' ? t('statusActive') : t('statusDisabled')}
                  {i.last_synced_at && ` · ${t('lastSyncedAt', { time: new Date(i.last_synced_at).toLocaleString() })}`}
                </p>
                {i.last_sync_result && (
                  <p className={`mt-0.5 text-xs ${i.last_sync_result.status === 'failed' ? 'text-danger' : 'text-text-secondary'}`}>
                    {i.last_sync_result.status === 'failed'
                      ? `${t('syncFailed')}: ${i.last_sync_result.error}`
                      : t('syncSummary', { imported: i.last_sync_result.imported ?? 0, skipped: i.last_sync_result.skipped ?? 0 })}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => sync.mutate(i.id)}
                  disabled={sync.isPending || i.status !== 'active'}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
                >
                  {t('syncNow')}
                </button>
                <button
                  onClick={() => setStatus.mutate({ id: i.id, status: i.status === 'active' ? 'disabled' : 'active' })}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
                >
                  {i.status === 'active' ? t('disable') : t('enable')}
                </button>
                <button
                  onClick={() => setExpandedRuns(expandedRuns === i.id ? null : i.id)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
                >
                  {t('history')}
                </button>
                <button
                  onClick={() => remove.mutate(i.id)}
                  className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10"
                >
                  {tCommon('remove')}
                </button>
              </div>
            </div>
            {expandedRuns === i.id && (
              <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-text-secondary">
                {runs?.length === 0 && <li>{t('emptySyncRuns')}</li>}
                {runs?.map((r) => (
                  <li key={r.id}>
                    {new Date(r.started_at).toLocaleString()} — {r.status}
                    {r.status === 'success'
                      ? ` (${t('syncSummary', { imported: r.items_imported, skipped: r.items_skipped })})`
                      : ` — ${r.error}`}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>

      <h2 className="mb-2 text-sm font-medium text-text-secondary">{t('connectorMarketplace')}</h2>
      <ul className="divide-y divide-border rounded border border-border">
        {typesLoading && <li className="px-4 py-3 text-text-secondary">{tCommon('loading')}</li>}
        {types?.map((ct) => (
          <li key={ct.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{ct.name}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{ct.description}</p>
              </div>
              <button
                onClick={() => {
                  setInstallingType(ct);
                  setForm({ name: `${ct.name} connector`, config: {}, credential: '' });
                }}
                className="shrink-0 rounded bg-accent px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-hover"
              >
                {t('install')}
              </button>
            </div>
          </li>
        ))}
      </ul>

      {installingType && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/40">
          <form
            className="w-full max-w-md rounded border border-border bg-surface p-4"
            onSubmit={(e) => {
              e.preventDefault();
              const { credential, ...configFields } = form.config as any;
              install.mutate(
                {
                  connectorTypeId: installingType.id,
                  name: form.name,
                  config: form.config,
                  credential: form.credential || undefined,
                },
                { onSuccess: () => setInstallingType(null) },
              );
            }}
          >
            <h3 className="mb-3 text-sm font-semibold">{t('installConnector', { name: installingType.name })}</h3>
            <label className="mb-1 block text-xs font-medium text-text-secondary">{t('installName')}</label>
            <input
              className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              required
            />
            {installingType.config_schema.map((field) =>
              field.type === 'secret' ? (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">{field.label}</label>
                  <input
                    type="password"
                    className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
                    value={form.credential}
                    onChange={(e) => setForm((f) => ({ ...f, credential: e.target.value }))}
                    required={field.required}
                  />
                </div>
              ) : (
                <div key={field.key}>
                  <label className="mb-1 block text-xs font-medium text-text-secondary">{field.label}</label>
                  <input
                    className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
                    value={form.config[field.key] ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, config: { ...f.config, [field.key]: e.target.value } }))}
                    required={field.required}
                  />
                </div>
              ),
            )}
            {install.error && <p className="mb-3 text-xs text-danger">{install.error.message}</p>}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInstallingType(null)}
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="submit"
                disabled={install.isPending}
                className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {t('install')}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
