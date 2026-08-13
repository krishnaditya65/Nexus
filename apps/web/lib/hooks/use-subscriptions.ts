// Scheduled JQL/filter subscriptions (docs/FEATURES.md §13.3) — wraps
// services/pm's subscriptions.controller.ts. The actual scheduling
// (hourly/daily/weekly cadence) is enforced server-side by
// services/notifications's new SchedulerService cron tick calling pm's
// internal run-due endpoint; this hook only covers the user-facing CRUD.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type Cadence = 'hourly' | 'daily' | 'weekly';

export interface Subscription {
  id: string;
  query_id: string;
  query_name: string;
  project_id: string;
  cadence: Cadence;
  last_run_at: string | null;
  created_at: string;
}

export function useSubscriptions() {
  return useQuery<Subscription[], ApiError>({
    queryKey: ['subscriptions'],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/subscriptions`),
  });
}

export function useCreateSubscription() {
  const qc = useQueryClient();
  return useMutation<Subscription, ApiError, { queryId: string; projectId: string; cadence: Cadence }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, `/subscriptions`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}

export function useDeleteSubscription() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiFetch(SERVICE_URLS.pm, `/subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['subscriptions'] }),
  });
}
