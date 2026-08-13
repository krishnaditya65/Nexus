// Wraps services/pm's backlog + sprint endpoints (see SprintsService's and
// TicketsService's docblocks). One hook file since the backlog page reads
// and mutates both concepts together (moving a ticket between them is the
// core interaction of sprint planning).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Ticket {
  id: string;
  ticket_number: number;
  title: string;
  type: string;
  state_name: string;
  story_points: string | number | null;
  backlog_rank: number | null;
  assignee_user_id: string | null;
}

export interface Sprint {
  id: string;
  name: string;
  goal: string;
  status: 'planned' | 'active' | 'completed';
  start_date: string | null;
  end_date: string | null;
}

export function useBacklog(projectId: string | null) {
  return useQuery<Ticket[], ApiError>({
    queryKey: ['backlog', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/backlog?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useSprints(projectId: string | null) {
  return useQuery<Sprint[], ApiError>({
    queryKey: ['sprints', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/sprints?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export interface VelocityPoint {
  sprintId: string;
  sprintName: string;
  completedAt: string;
  completedPoints: number;
}

/** Story points completed per completed sprint, oldest first — backs
 *  §2's velocity chart / the dashboard's velocity_trend widget. */
export function useVelocityTrend(projectId: string | null) {
  return useQuery<VelocityPoint[], ApiError>({
    queryKey: ['velocity', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/sprints/velocity?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

/** Every ticket in a project regardless of sprint/backlog status —
 *  what a "ticket counts by state" dashboard widget needs, unlike
 *  useBacklog (backlog-only) or useBoard (one sprint/Kanban view only). */
export function useAllTickets(projectId: string | null) {
  return useQuery<Ticket[], ApiError>({
    queryKey: ['allTickets', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

/** Every mutation below invalidates both the backlog and sprints queries —
 *  moving/creating a ticket can affect either view, and correctness here
 *  matters more than avoiding one extra refetch. */
function useInvalidateBacklog(projectId: string | null) {
  const qc = useQueryClient();
  return () => {
    qc.invalidateQueries({ queryKey: ['backlog', projectId] });
    qc.invalidateQueries({ queryKey: ['sprints', projectId] });
    qc.invalidateQueries({ queryKey: ['board', projectId] });
  };
}

export function useCreateTicket(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<Ticket, ApiError, { type: string; title: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/tickets', {
        method: 'POST',
        body: JSON.stringify({ projectId, ...body }),
      }),
    onSuccess: invalidate,
  });
}

export function useCreateSprint(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<Sprint, ApiError, { name: string; goal?: string; startDate?: string; endDate?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/sprints', {
        method: 'POST',
        body: JSON.stringify({ projectId, ...body }),
      }),
    onSuccess: invalidate,
  });
}

export function useStartSprint(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<Sprint, ApiError, string>({
    mutationFn: (sprintId) => apiFetch(SERVICE_URLS.pm, `/sprints/${sprintId}/start`, { method: 'POST' }),
    onSuccess: invalidate,
  });
}

export function useCompleteSprint(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<unknown, ApiError, string>({
    mutationFn: (sprintId) => apiFetch(SERVICE_URLS.pm, `/sprints/${sprintId}/complete`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
  });
}

export function useAssignToSprint(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<Ticket, ApiError, { ticketId: string; sprintId: string | null }>({
    mutationFn: ({ ticketId, sprintId }) =>
      apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/sprint`, {
        method: 'POST',
        body: JSON.stringify({ sprintId }),
      }),
    onSuccess: invalidate,
  });
}

export interface BulkUpdateResult {
  ticketId: string;
  ok: boolean;
  error?: string;
}

/** §11.2 bulk edit — applies the same transition/assignee/sprint change
 *  to a set of tickets and reports per-ticket success/failure, since one
 *  mismatched transition shouldn't block every other ticket in the batch. */
export function useBulkUpdateTickets(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<BulkUpdateResult[], ApiError, { ticketIds: string[]; transitionName?: string; assigneeUserId?: string | null; sprintId?: string | null }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/tickets/bulk', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });
}

export function useAssignTicket(projectId: string | null) {
  const invalidate = useInvalidateBacklog(projectId);
  return useMutation<Ticket, ApiError, { ticketId: string; assigneeUserId: string | null }>({
    mutationFn: ({ ticketId, assigneeUserId }) =>
      apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/assignee`, {
        method: 'POST',
        body: JSON.stringify({ assigneeUserId }),
      }),
    onSuccess: invalidate,
  });
}
