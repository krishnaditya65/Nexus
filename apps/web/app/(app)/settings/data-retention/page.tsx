'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useBackupPolicies,
  useSeedBackupPolicyDefaults,
  useEnforceRetention,
  usePurgeRuns,
  useTicketBackupRuns,
  useTakeTicketsBackup,
  useVerifyTicketsRestore,
} from '@/lib/hooks/use-backup-policies';
import { SettingsNav } from '@/components/settings-nav';

const ENFORCEABLE_CLASSES = ['chat_history'];
const BACKUP_AUTOMATED_CLASSES = ['tickets'];

export default function DataRetentionSettingsPage() {
  const t = useTranslations('dataRetention');
  const tCommon = useTranslations('common');
  const { data: policies, isLoading, error } = useBackupPolicies();
  const seedDefaults = useSeedBackupPolicyDefaults();
  const enforceRetention = useEnforceRetention();

  const [expanded, setExpanded] = useState<string | null>(null);
  const { data: purgeRuns } = usePurgeRuns(expanded);

  const { data: backupRuns } = useTicketBackupRuns();
  const takeBackup = useTakeTicketsBackup();
  const verifyRestore = useVerifyTicketsRestore();

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {policies?.length === 0 && (
        <div className="mb-6 rounded border border-border p-4">
          <p className="mb-3 text-sm text-text-secondary">{t('noPolicies')}</p>
          <button
            onClick={() => seedDefaults.mutate()}
            disabled={seedDefaults.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('seedDefaults')}
          </button>
        </div>
      )}

      <ul className="divide-y divide-border rounded border border-border">
        {policies?.map((p) => (
          <li key={p.id} className="px-4 py-3 text-sm">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">{p.data_class}</p>
                <p className="mt-0.5 text-xs text-text-secondary">
                  {t('retentionSummary', { days: p.retention_days, rpo: p.rpo_minutes, rto: p.rto_minutes })}
                  {p.last_purge_at && ` · ${t('lastPurged', { time: new Date(p.last_purge_at).toLocaleString() })}`}
                  {p.last_verified_restore_at &&
                    ` · ${t('lastVerifiedRestore', { time: new Date(p.last_verified_restore_at).toLocaleString() })}`}
                </p>
              </div>
              <div className="flex gap-2">
                {BACKUP_AUTOMATED_CLASSES.includes(p.data_class) && (
                  <>
                    <button
                      onClick={() => takeBackup.mutate()}
                      disabled={takeBackup.isPending}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
                    >
                      {t('takeBackup')}
                    </button>
                    <button
                      onClick={() => verifyRestore.mutate()}
                      disabled={verifyRestore.isPending}
                      className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
                    >
                      {t('verifyRestore')}
                    </button>
                  </>
                )}
                {ENFORCEABLE_CLASSES.includes(p.data_class) ? (
                  <button
                    onClick={() => enforceRetention.mutate(p.data_class)}
                    disabled={enforceRetention.isPending}
                    className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
                  >
                    {t('enforceNow')}
                  </button>
                ) : (
                  <span className="text-xs text-text-secondary">{t('notEnforceable')}</span>
                )}
                <button
                  onClick={() => setExpanded(expanded === p.data_class ? null : p.data_class)}
                  className="rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
                >
                  {t('history')}
                </button>
              </div>
            </div>
            {expanded === p.data_class && (
              <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-text-secondary">
                {purgeRuns?.length === 0 && <li>{t('emptyPurgeRuns')}</li>}
                {purgeRuns?.map((r) => (
                  <li key={r.id}>
                    {new Date(r.ran_at).toLocaleString()} — {t('deletedCount', { count: r.deleted_count })}
                  </li>
                ))}
              </ul>
            )}
            {BACKUP_AUTOMATED_CLASSES.includes(p.data_class) && backupRuns && backupRuns.length > 0 && (
              <ul className="mt-2 space-y-1 border-t border-border pt-2 text-xs text-text-secondary">
                {backupRuns.slice(0, 3).map((r) => (
                  <li key={r.id}>
                    {new Date(r.taken_at).toLocaleString()} — {t('backupRowCount', { count: r.row_count })}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
      {enforceRetention.isError && <p className="mt-3 text-xs text-danger">{enforceRetention.error.message}</p>}
      {verifyRestore.isSuccess && (
        <p className={`mt-3 text-xs ${verifyRestore.data.verified ? 'text-success' : 'text-danger'}`}>
          {verifyRestore.data.verified
            ? t('verifySucceeded', { count: verifyRestore.data.rowCount })
            : t('verifyFailed', { error: verifyRestore.data.error ?? '' })}
        </p>
      )}
    </div>
  );
}
