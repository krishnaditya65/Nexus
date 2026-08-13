// §12.3 forms → tickets. Two distinct surfaces: authenticated management
// (create/list forms + view submissions) and the anonymous public
// render/submit flow (no apiFetch's auth header involved at all — see
// api-client.ts, apiFetch always reads the auth store; public routes use
// plain fetch instead so an anonymous visitor never needs a session).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'textarea';
  required: boolean;
}

export interface TicketForm {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  is_public: boolean;
  public_token: string;
  default_ticket_type: string;
  fields: FormField[];
  created_at: string;
}

export interface FormSubmission {
  id: string;
  form_id: string;
  ticket_id: string | null;
  submitted_data: Record<string, string>;
  submitter_email: string | null;
  submitted_at: string;
}

export function useForms(projectId: string | null) {
  return useQuery<TicketForm[], ApiError>({
    queryKey: ['forms', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/forms?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateForm(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<
    TicketForm,
    ApiError,
    { name: string; description?: string; isPublic: boolean; defaultTicketType: string; fields: FormField[] }
  >({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/forms', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['forms', projectId] }),
  });
}

export function useFormSubmissions(formId: string | null) {
  return useQuery<FormSubmission[], ApiError>({
    queryKey: ['formSubmissions', formId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/forms/${formId}/submissions`),
    enabled: !!formId,
  });
}

// --- Public (anonymous) — plain fetch, no auth header, no ApiError
// wrapping (a public visitor's browser has no session to attach). ---

export interface PublicForm {
  id: string;
  project_id: string;
  name: string;
  description: string | null;
  fields: FormField[];
  default_ticket_type: string;
}

export async function fetchPublicForm(token: string): Promise<PublicForm> {
  const res = await fetch(`${SERVICE_URLS.pm}/forms/public/${token}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Form not found');
  return res.json();
}

export async function submitPublicForm(
  token: string,
  data: Record<string, string>,
  submitterEmail?: string,
): Promise<{ ticketId: string; ticketNumber: number }> {
  const res = await fetch(`${SERVICE_URLS.pm}/forms/public/${token}/submit`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ data, submitterEmail }),
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Submission failed');
  return res.json();
}

// --- Branded customer self-service portal (§13.7) — same public token,
// two more anonymous reads: request-status tracking (by the email the
// requester submitted with) and public KB articles for the project. ---

export interface PublicRequest {
  submissionId: string;
  ticketId: string;
  ticketNumber: number;
  title: string;
  stateName: string;
  submittedAt: string;
}

export interface PublicKbArticle {
  id: string;
  title: string;
  content: string;
  updated_at: string;
}

export async function fetchPublicRequests(token: string, email: string): Promise<PublicRequest[]> {
  const res = await fetch(`${SERVICE_URLS.pm}/forms/public/${token}/my-requests?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Lookup failed');
  return res.json();
}

export async function fetchPublicKbArticles(token: string): Promise<PublicKbArticle[]> {
  const res = await fetch(`${SERVICE_URLS.pm}/forms/public/${token}/kb`);
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message ?? 'Failed to load KB articles');
  return res.json();
}

export function useSetWikiPagePublic() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string; projectId: string; isPublic: boolean }>({
    mutationFn: ({ id, isPublic }) =>
      apiFetch(SERVICE_URLS.pm, `/wiki-pages/${id}/public`, { method: 'PATCH', body: JSON.stringify({ isPublic }) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['wikiPages', vars.projectId] }),
  });
}
