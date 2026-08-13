import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';
import { Ticket } from './use-backlog';

export interface TicketTemplate {
  id: string;
  name: string;
  ticket_type: string;
  title_template: string;
  description_template: string;
}

export function useTicketTemplates(projectId: string | null) {
  return useQuery<TicketTemplate[], ApiError>({
    queryKey: ['ticket-templates', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/ticket-templates?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateTicketTemplate(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<TicketTemplate, ApiError, { name: string; ticketType: string; titleTemplate: string; descriptionTemplate?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/ticket-templates', { method: 'POST', body: JSON.stringify({ projectId, ...body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ticket-templates', projectId] }),
  });
}

export function useCreateTicketFromTemplate(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<Ticket, ApiError, { templateId: string; title?: string; description?: string }>({
    mutationFn: ({ templateId, ...body }) =>
      apiFetch(SERVICE_URLS.pm, `/ticket-templates/${templateId}/create-ticket`, { method: 'POST', body: JSON.stringify({ projectId, ...body }) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['backlog', projectId] });
      qc.invalidateQueries({ queryKey: ['allTickets', projectId] });
    },
  });
}
