'use client';

import { useTranslations } from 'next-intl';
import {
  NOTIFICATION_CATEGORIES,
  ALWAYS_DELIVERED_CATEGORIES,
  useNotificationPreferences,
  useSetNotificationPreference,
  useDigestSettings,
  useSetDigestFrequency,
  DigestFrequency,
} from '@/lib/hooks/use-notification-preferences';

const CATEGORY_LABELS: Record<string, string> = {
  automation: 'Automation updates',
  query_subscription: 'Saved search subscriptions',
  mention: 'Mentions in chat',
  approval_request: 'Approval requests & decisions',
  call_page: 'Call paging',
  incident_page: 'Incident paging',
  new_device_challenge: 'New device sign-in',
  notification_scheme: 'Project notification scheme (ticket events)',
};

/** §12.6 — a user's own global (project_id: null) mute switch per
 *  category. Two categories (incident_page, new_device_challenge) are
 *  rendered disabled, always-on — see preferences.ts's
 *  ALWAYS_DELIVERED_CATEGORIES docblock for why those specifically can
 *  never be muted. Per-project overrides exist in the API but have no
 *  dedicated UI yet — disclosed follow-up, same partial-rollout pattern
 *  as this build's other settings surfaces. */
export default function NotificationPreferencesPage() {
  const t = useTranslations('notificationPreferences');
  const tCommon = useTranslations('common');
  const { data: preferences, isLoading } = useNotificationPreferences();
  const setPreference = useSetNotificationPreference();
  const { data: digest } = useDigestSettings();
  const setDigestFrequency = useSetDigestFrequency();

  const globalEnabledFor = (category: string): boolean => {
    const row = preferences?.find((p) => p.category === category && p.project_id === null);
    return row ? row.enabled : true; // no row = opt-out default: enabled
  };

  return (
    <div className="mx-auto max-w-xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {NOTIFICATION_CATEGORIES.map((category) => {
          const alwaysOn = (ALWAYS_DELIVERED_CATEGORIES as readonly string[]).includes(category);
          const enabled = alwaysOn ? true : globalEnabledFor(category);
          return (
            <li key={category} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{CATEGORY_LABELS[category] ?? category}</p>
                {alwaysOn && <p className="text-xs text-text-secondary">{t('alwaysOn')}</p>}
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={enabled}
                  disabled={alwaysOn || setPreference.isPending}
                  onChange={(e) => setPreference.mutate({ category, enabled: e.target.checked })}
                  className="h-4 w-4"
                />
              </label>
            </li>
          );
        })}
      </ul>

      <h2 className="mb-2 mt-8 text-sm font-medium text-text-secondary">{t('digestHeading')}</h2>
      <p className="mb-3 text-sm text-text-secondary">{t('digestSubtitle')}</p>
      <select
        value={digest?.frequency ?? 'off'}
        disabled={setDigestFrequency.isPending}
        onChange={(e) => setDigestFrequency.mutate(e.target.value as DigestFrequency)}
        className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
      >
        <option value="off">{t('digestOff')}</option>
        <option value="daily">{t('digestDaily')}</option>
        <option value="weekly">{t('digestWeekly')}</option>
      </select>
    </div>
  );
}
