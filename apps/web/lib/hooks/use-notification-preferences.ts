// §12.6 per-user notification preferences — wraps services/notifications'
// new /notification-preferences endpoints. This UI covers the GLOBAL
// (project_id: null) preference row per category only — the API also
// supports a per-project override (POST with a projectId), but a
// dedicated per-project settings surface is a disclosed follow-up, not
// built this pass; setting the global default is the higher-traffic case
// (most users want "mute X everywhere", not "mute X on project Y only").
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export const NOTIFICATION_CATEGORIES = [
  'automation',
  'query_subscription',
  'mention',
  'approval_request',
  'call_page',
  'incident_page',
  'new_device_challenge',
  'notification_scheme',
] as const;

// Mirrors preferences.ts's ALWAYS_DELIVERED_CATEGORIES — kept as a plain
// constant here (not fetched from the backend) since the toggle UI needs
// to know synchronously which rows to render as non-interactive.
export const ALWAYS_DELIVERED_CATEGORIES = ['incident_page', 'new_device_challenge'] as const;

export interface NotificationPreference {
  id: string;
  category: string;
  project_id: string | null;
  enabled: boolean;
}

export function useNotificationPreferences() {
  return useQuery<NotificationPreference[], ApiError>({
    queryKey: ['notificationPreferences'],
    queryFn: () => apiFetch(SERVICE_URLS.notifications, '/notification-preferences'),
  });
}

export function useSetNotificationPreference() {
  const qc = useQueryClient();
  return useMutation<NotificationPreference, ApiError, { category: string; enabled: boolean }>({
    mutationFn: ({ category, enabled }) =>
      apiFetch(SERVICE_URLS.notifications, '/notification-preferences', {
        method: 'POST',
        body: JSON.stringify({ category, projectId: null, enabled }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificationPreferences'] }),
  });
}

// §12.6 digest emails — opt-IN (default 'off'), distinct from the
// opt-out category mutes above. A daily/weekly rollup email of whatever
// landed in the user's notification_deliveries since their last digest.
export type DigestFrequency = 'off' | 'daily' | 'weekly';

export function useDigestSettings() {
  return useQuery<{ frequency: DigestFrequency }, ApiError>({
    queryKey: ['digestSettings'],
    queryFn: () => apiFetch(SERVICE_URLS.notifications, '/digest-settings'),
  });
}

export function useSetDigestFrequency() {
  const qc = useQueryClient();
  return useMutation<{ frequency: DigestFrequency }, ApiError, DigestFrequency>({
    mutationFn: (frequency) =>
      apiFetch(SERVICE_URLS.notifications, '/digest-settings', { method: 'POST', body: JSON.stringify({ frequency }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['digestSettings'] }),
  });
}
