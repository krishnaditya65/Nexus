// §13.8 Notification Schemes — wraps services/pm's new
// /notification-schemes endpoints. Project-level admin default for "who
// gets notified when a standard ticket event happens" — distinct from
// use-notification-preferences.ts's personal per-user mute.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export const NOTIFICATION_SCHEME_EVENT_TYPES = ['ticket_created', 'status_changed', 'assigned'] as const;
export const NOTIFICATION_SCHEME_ROLES = ['assignee', 'watchers'] as const;

export interface NotificationSchemeRule {
  eventType: string;
  notifyRoles: string[];
  isDefault: boolean;
}

export function useNotificationScheme(projectId: string | null) {
  return useQuery<NotificationSchemeRule[], ApiError>({
    queryKey: ['notificationScheme', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/notification-schemes/${projectId}`),
    enabled: !!projectId,
  });
}

export function useSetNotificationSchemeRule(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { eventType: string; notifyRoles: string[] }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/notification-schemes', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notificationScheme', projectId] }),
  });
}
