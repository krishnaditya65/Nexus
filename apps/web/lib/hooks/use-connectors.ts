// Wraps services/api-platform's connector marketplace endpoints (§11.9
// plugin/connector framework). Credentials are shown-once-at-install, same
// discipline as webhook signing secrets / API keys — list()/get() never
// return them, so there is no `credential` field on ConnectorInstall.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface ConnectorConfigField {
  key: string;
  label: string;
  type: 'text' | 'secret';
  required: boolean;
}

export interface ConnectorType {
  id: string;
  name: string;
  description: string;
  config_schema: ConnectorConfigField[];
  capabilities: string[];
}

export interface ConnectorInstall {
  id: string;
  connector_type_id: string;
  name: string;
  config: Record<string, any>;
  status: 'active' | 'disabled';
  last_synced_at: string | null;
  last_sync_result: { status: 'success' | 'failed'; imported?: number; skipped?: number; error?: string } | null;
  created_at: string;
}

export interface ConnectorSyncRun {
  id: string;
  status: 'success' | 'failed';
  items_imported: number;
  items_skipped: number;
  error: string | null;
  started_at: string;
  finished_at: string | null;
}

export function useConnectorTypes() {
  return useQuery<ConnectorType[], ApiError>({
    queryKey: ['connector-types'],
    queryFn: () => apiFetch(SERVICE_URLS.apiPlatform, '/connector-types'),
  });
}

export function useConnectors() {
  return useQuery<ConnectorInstall[], ApiError>({
    queryKey: ['connectors'],
    queryFn: () => apiFetch(SERVICE_URLS.apiPlatform, '/connectors'),
  });
}

export function useInstallConnector() {
  const qc = useQueryClient();
  return useMutation<
    ConnectorInstall,
    ApiError,
    { connectorTypeId: string; name: string; config: Record<string, any>; credential?: string }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.apiPlatform, '/connectors', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connectors'] }),
  });
}

export function useSetConnectorStatus() {
  const qc = useQueryClient();
  return useMutation<ConnectorInstall, ApiError, { id: string; status: 'active' | 'disabled' }>({
    mutationFn: ({ id, status }) =>
      apiFetch(SERVICE_URLS.apiPlatform, `/connectors/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connectors'] }),
  });
}

export function useRemoveConnector() {
  const qc = useQueryClient();
  return useMutation<void, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.apiPlatform, `/connectors/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['connectors'] }),
  });
}

export function useSyncConnector() {
  const qc = useQueryClient();
  return useMutation<{ status: string; imported: number; skipped: number }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.apiPlatform, `/connectors/${id}/sync`, { method: 'POST' }),
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['connectors'] });
      qc.invalidateQueries({ queryKey: ['connector-sync-runs', id] });
    },
  });
}

export function useConnectorSyncRuns(installId: string | null) {
  return useQuery<ConnectorSyncRun[], ApiError>({
    queryKey: ['connector-sync-runs', installId],
    queryFn: () => apiFetch(SERVICE_URLS.apiPlatform, `/connectors/${installId}/sync-runs`),
    enabled: !!installId,
  });
}
