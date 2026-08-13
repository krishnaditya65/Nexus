// Feature-flag status on a ticket (docs/FEATURES.md §13.5, the last of the
// Development Panel's three sub-items). Wraps services/cicd's explicit
// flag<->ticket link — unlike commit/PR linking, this is NOT inferred from
// a regex (a flag key like "new-checkout-flow" and a ticket key like
// "CONN-42" share no naming convention worth pattern-matching), so it's an
// admin-linked association, not an automatic scan.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface FlagTarget {
  environment_name: string;
  is_enabled: boolean;
  rollout_percentage: number | null;
}

export interface LinkedFlag {
  id: string;
  key: string;
  name: string;
  default_enabled: boolean;
  targets: FlagTarget[];
}

export function useFlagsByTicket(ticketKey: string | null) {
  return useQuery<LinkedFlag[], ApiError>({
    queryKey: ['flagsByTicket', ticketKey],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/feature-flags/by-ticket?ticketKey=${ticketKey}`),
    enabled: !!ticketKey,
  });
}

export function useLinkFlagToTicket() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { flagKey: string; ticketKey: string }>({
    mutationFn: ({ flagKey, ticketKey }) =>
      apiFetch(SERVICE_URLS.cicd, `/feature-flags/${flagKey}/link-ticket`, {
        method: 'POST',
        body: JSON.stringify({ ticketKey }),
      }),
    onSuccess: (_data, vars) => qc.invalidateQueries({ queryKey: ['flagsByTicket', vars.ticketKey] }),
  });
}
