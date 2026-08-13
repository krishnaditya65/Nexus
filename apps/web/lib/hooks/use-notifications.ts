// §12.6 notification inbox — wraps services/notifications' new inbox
// endpoints (GET /notifications, /notifications/unread-count,
// POST /notifications/:id/read, /notifications/read-all), all backed by
// the notification_deliveries table push sends already wrote to for
// every mention/page/automation, just never exposed back to the user
// until now.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface NotificationDelivery {
  id: string;
  title: string;
  body: string;
  category: string;
  status: 'sent' | 'failed' | 'no_subscription' | 'muted';
  read_at: string | null;
  created_at: string;
}

export function useNotifications() {
  return useQuery<NotificationDelivery[], ApiError>({
    queryKey: ['notifications'],
    queryFn: () => apiFetch(SERVICE_URLS.notifications, '/notifications'),
  });
}

// Polled rather than pushed — this platform has no WebSocket/SSE channel
// for notifications specifically (comms' chat has its own dedicated
// socket; reusing it for a cross-cutting concern like this would be a
// layering violation). 20s keeps a badge reasonably fresh without
// hammering the service.
export function useUnreadNotificationCount() {
  return useQuery<{ count: number }, ApiError>({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiFetch(SERVICE_URLS.notifications, '/notifications/unread-count'),
    refetchInterval: 20_000,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.notifications, `/notifications/${id}/read`, { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation<{ markedRead: number }, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.notifications, '/notifications/read-all', { method: 'POST', body: '{}' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}
