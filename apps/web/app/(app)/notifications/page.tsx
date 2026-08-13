'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useNotifications,
  useMarkNotificationRead,
  useMarkAllNotificationsRead,
} from '@/lib/hooks/use-notifications';

const CATEGORY_LABELS: Record<string, string> = {
  mention: 'Mention',
  incident_page: 'Incident page',
  approval_request: 'Approval request',
  automation: 'Automation',
  query_subscription: 'Saved search subscription',
  call_page: 'Call page',
  new_device_challenge: 'New device sign-in',
  notification_scheme: 'Project notification scheme',
  general: 'General',
};

export default function NotificationsPage() {
  const t = useTranslations('notifications');
  const tCommon = useTranslations('common');
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAllRead = useMarkAllNotificationsRead();

  const unreadCount = notifications?.filter((n) => !n.read_at).length ?? 0;

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <div className="flex items-center gap-2">
          <Link href="/notifications/preferences" className="text-sm text-accent hover:underline">
            {t('preferencesLink')}
          </Link>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
            >
              {t('markAllRead')}
            </button>
          )}
        </div>
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {notifications?.map((n) => (
          <li
            key={n.id}
            className={`flex items-start justify-between gap-4 px-4 py-3 ${n.read_at ? '' : 'bg-accent/5'}`}
          >
            <div>
              <div className="mb-0.5 flex items-center gap-2">
                {!n.read_at && <span className="h-2 w-2 rounded-full bg-accent" aria-hidden />}
                <span className="text-sm font-medium">{n.title}</span>
                <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">
                  {CATEGORY_LABELS[n.category] ?? n.category}
                </span>
              </div>
              <p className="text-sm text-text-secondary">{n.body}</p>
              <p className="mt-0.5 text-xs text-text-secondary">{new Date(n.created_at).toLocaleString()}</p>
            </div>
            {!n.read_at && (
              <button
                onClick={() => markRead.mutate(n.id)}
                disabled={markRead.isPending}
                className="shrink-0 rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
              >
                {t('markRead')}
              </button>
            )}
          </li>
        ))}
        {notifications?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
