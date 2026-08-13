'use client';

import { useTranslations } from 'next-intl';
import {
  NOTIFICATION_SCHEME_ROLES,
  useNotificationScheme,
  useSetNotificationSchemeRule,
} from '@/lib/hooks/use-notification-schemes';

const EVENT_LABELS: Record<string, string> = {
  ticket_created: 'Ticket created',
  status_changed: 'Status changed',
  assigned: 'Ticket assigned',
};

const ROLE_LABELS: Record<string, string> = {
  assignee: 'The assignee',
  watchers: 'Watchers',
};

/** §13.8 — project-level admin default for who gets notified on standard
 *  ticket events, distinct from a user's own personal mute preference
 *  (/notifications/preferences). Independent of and can run alongside
 *  §12.2's automation engine for the same event. */
export default function NotificationSchemePage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('notificationScheme');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: rules, isLoading } = useNotificationScheme(projectId);
  const setRule = useSetNotificationSchemeRule(projectId);

  const toggleRole = (eventType: string, currentRoles: string[], role: string, checked: boolean) => {
    const nextRoles = checked ? [...currentRoles, role] : currentRoles.filter((r) => r !== role);
    setRule.mutate({ eventType, notifyRoles: nextRoles });
  };

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {rules?.map((rule) => (
          <li key={rule.eventType} className="px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-sm font-medium">{EVENT_LABELS[rule.eventType] ?? rule.eventType}</span>
              {rule.isDefault && (
                <span className="rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">{t('defaultBadge')}</span>
              )}
            </div>
            <div className="flex gap-4">
              {NOTIFICATION_SCHEME_ROLES.map((role) => (
                <label key={role} className="inline-flex items-center gap-1.5 text-sm">
                  <input
                    type="checkbox"
                    checked={rule.notifyRoles.includes(role)}
                    disabled={setRule.isPending}
                    onChange={(e) => toggleRole(rule.eventType, rule.notifyRoles, role, e.target.checked)}
                    className="h-4 w-4"
                  />
                  {ROLE_LABELS[role] ?? role}
                </label>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
