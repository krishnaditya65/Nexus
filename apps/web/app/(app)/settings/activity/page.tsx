'use client';

import { useTranslations } from 'next-intl';
import { useAuditLog, useVerifyAuditChain } from '@/lib/hooks/use-audit-log';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';
import { SettingsNav } from '@/components/settings-nav';

export default function ActivityFeedPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { data: events, isLoading, error } = useAuditLog();
  const { data: users } = useTenantUsers();
  const verifyChain = useVerifyAuditChain();

  function actorName(userId: string | null) {
    if (!userId) return t('systemActor');
    return users?.find((u) => u.id === userId)?.display_name ?? userId.slice(0, 8);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('activityTitle')}</h1>
      <p className="mb-4 text-sm text-text-secondary">{t('activitySubtitle')}</p>

      <div className="mb-6 flex items-center gap-3">
        <button
          onClick={() => verifyChain.mutate()}
          disabled={verifyChain.isPending}
          className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
        >
          {t('verifyChain')}
        </button>
        {verifyChain.isSuccess && verifyChain.data.valid && (
          <p className="text-sm text-success">{t('chainValid', { count: verifyChain.data.entriesChecked })}</p>
        )}
        {verifyChain.isSuccess && !verifyChain.data.valid && (
          <p role="alert" className="text-sm text-danger">
            {t('chainBroken', { reason: verifyChain.data.reason ?? '' })}
          </p>
        )}
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {events?.map((e) => (
          <li key={e.id} className="px-4 py-3 text-sm">
            <p>
              <span className="font-medium">{actorName(e.actor_user_id)}</span>{' '}
              <span className="text-text-secondary">{e.action}</span>
              {e.resource_type && <span className="text-text-secondary"> · {e.resource_type}</span>}
            </p>
            <p className="mt-1 text-xs text-text-secondary">{new Date(e.created_at).toLocaleString()}</p>
          </li>
        ))}
        {events?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyActivity')}</li>}
      </ul>
    </div>
  );
}
