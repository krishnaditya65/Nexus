// Wraps services/pm's single-ticket detail endpoints — history/watchers/
// links, everything a Backlog/Board row is too dense to show inline.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface TicketDetail {
  id: string;
  ticket_number: number;
  title: string;
  description: string;
  type: string;
  state_name: string;
  state_id: string;
  story_points: string | number | null;
  assignee_user_id: string | null;
  parent_ticket_id: string | null;
  release_id: string | null;
  custom_fields: Record<string, unknown>;
  entered_current_state_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TicketTransition {
  id: string;
  from_state_id: string | null;
  to_state_id: string;
  transitioned_at: string;
}

export interface TicketLink {
  id: string;
  target_ticket_id: string;
  target_title: string;
  target_ticket_number: number;
  link_type: 'blocks' | 'duplicates' | 'relates_to';
}

export function useTicket(ticketId: string | null) {
  return useQuery<TicketDetail, ApiError>({
    queryKey: ['ticket', ticketId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}`),
    enabled: !!ticketId,
  });
}

export function useTicketTransitions(ticketId: string | null) {
  return useQuery<TicketTransition[], ApiError>({
    queryKey: ['ticket-transitions', ticketId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/transitions`),
    enabled: !!ticketId,
  });
}

export function useTicketLinks(ticketId: string | null) {
  return useQuery<TicketLink[], ApiError>({
    queryKey: ['ticket-links', ticketId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/links`),
    enabled: !!ticketId,
  });
}

export function useTicketWatchers(ticketId: string | null) {
  return useQuery<string[], ApiError>({
    queryKey: ['ticket-watchers', ticketId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/watchers`),
    enabled: !!ticketId,
  });
}

export function useWatchTicket(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/watch`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-watchers', ticketId] }),
  });
}

export function useUnwatchTicket(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, void>({
    mutationFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/unwatch`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-watchers', ticketId] }),
  });
}

export function useAddTicketLink(ticketId: string | null) {
  const qc = useQueryClient();
  return useMutation<TicketLink, ApiError, { targetTicketId: string; linkType: 'blocks' | 'duplicates' | 'relates_to' }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, `/tickets/${ticketId}/links`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-links', ticketId] }),
  });
}

export interface DependencyGraph {
  nodes: Array<{ id: string; ticket_number: number; type: string; title: string; story_points: number | null; state_name: string }>;
  edges: Array<{ source: string; target: string; linkType: string }>;
}

export function useDependencyGraph(projectId: string | null) {
  return useQuery<DependencyGraph, ApiError>({
    queryKey: ['dependency-graph', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/graph?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

// §12.8 — the longest chain of real "blocks" dependencies through the
// project's graph, weighted by story points. See
// TicketsService.criticalPath's docblock for the algorithm and why a
// cycle is reported rather than crashing/hanging.
export interface CriticalPath {
  hasCycle: boolean;
  totalPoints: number;
  path: Array<{ id: string; ticketNumber: number; title: string }>;
}

export function useCriticalPath(projectId: string | null) {
  return useQuery<CriticalPath, ApiError>({
    queryKey: ['critical-path', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/tickets/critical-path?projectId=${projectId}`),
    enabled: !!projectId,
  });
}
