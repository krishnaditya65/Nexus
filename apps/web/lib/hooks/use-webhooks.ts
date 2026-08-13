// Wraps services/api-platform's webhook subscription endpoints ("Service
// hooks" in ADO's Project Settings). The signing secret is shown once,
// on creation, never again — see webhooks.service.ts's docblock.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface WebhookSubscription {
  id: string;
  target_url: string;
  event_types: string[];
  is_enabled: boolean;
  created_at: string;
}

export interface CreatedWebhook extends WebhookSubscription {
  signingSecret: string;
  warning: string;
}

export function useWebhooks() {
  return useQuery<WebhookSubscription[], ApiError>({
    queryKey: ['webhooks'],
    queryFn: () => apiFetch(SERVICE_URLS.apiPlatform, '/webhook-subscriptions'),
  });
}

export function useCreateWebhook() {
  const qc = useQueryClient();
  return useMutation<CreatedWebhook, ApiError, { targetUrl: string; eventTypes: string[] }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.apiPlatform, '/webhook-subscriptions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['webhooks'] }),
  });
}
