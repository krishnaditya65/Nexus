// §12.4 generic ticket-level approval workflow — distinct from
// services/cicd's environment/deployment approval gates.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface TicketApproval {
  id: string;
  ticket_id: string;
  requested_by_user_id: string;
  approver_user_id: string;
  status: 'pending' | 'approved' | 'rejected';
  request_comment: string | null;
  decision_comment: string | null;
  requested_at: string;
  decided_at: string | null;
  ticket_title?: string;
  ticket_number?: number;
  project_id?: string;
}

export function useTicketApprovals(ticketId: string | null) {
  return useQuery<TicketApproval[], ApiError>({
    queryKey: ['ticketApprovals', ticketId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/approvals`),
    enabled: !!ticketId,
  });
}

export function useRequestApproval(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation<TicketApproval, ApiError, { approverUserId: string; comment?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/approvals`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticketApprovals', ticketId] }),
  });
}

export function useMyApprovals() {
  return useQuery<TicketApproval[], ApiError>({
    queryKey: ['myApprovals'],
    queryFn: () => apiFetch(SERVICE_URLS.pm, '/approvals/mine'),
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation<TicketApproval, ApiError, { id: string; decision: 'approved' | 'rejected'; comment?: string }>({
    mutationFn: ({ id, ...body }) =>
      apiFetch(SERVICE_URLS.pm, `/approvals/${id}/decide`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (result) => {
      qc.invalidateQueries({ queryKey: ['myApprovals'] });
      qc.invalidateQueries({ queryKey: ['ticketApprovals', result.ticket_id] });
    },
  });
}
