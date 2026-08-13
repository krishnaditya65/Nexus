// Asset Management / CMDB (docs/FEATURES.md §13.7) — wraps
// services/onboarding's new assets.controller.ts. See AssetsService's
// docblock for how this differs from onboarding's provisioning-task
// event logs.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type AssetType = 'hardware' | 'software_license' | 'server';
export type AssetStatus = 'in_stock' | 'in_use' | 'maintenance' | 'retired';

export interface Asset {
  id: string;
  asset_tag: string;
  name: string;
  asset_type: AssetType;
  status: AssetStatus;
  assigned_to_user_id: string | null;
  serial_number: string | null;
  purchase_date: string | null;
  warranty_expires: string | null;
  created_at: string;
}

export interface AssetDetail extends Asset {
  linkedTickets: Array<{ id: string; ticket_id: string; ticket_key: string; created_at: string }>;
}

export interface LinkedAsset {
  id: string;
  asset_tag: string;
  name: string;
  asset_type: AssetType;
  status: AssetStatus;
}

export function useAssets(filters: { status?: AssetStatus; assetType?: AssetType } = {}) {
  const params = new URLSearchParams();
  if (filters.status) params.set('status', filters.status);
  if (filters.assetType) params.set('assetType', filters.assetType);
  const qs = params.toString();
  return useQuery<Asset[], ApiError>({
    queryKey: ['assets', filters.status, filters.assetType],
    queryFn: () => apiFetch(SERVICE_URLS.onboarding, `/assets${qs ? `?${qs}` : ''}`),
  });
}

export function useAsset(id: string | null) {
  return useQuery<AssetDetail, ApiError>({
    queryKey: ['asset', id],
    queryFn: () => apiFetch(SERVICE_URLS.onboarding, `/assets/${id}`),
    enabled: !!id,
  });
}

export function useCreateAsset() {
  const qc = useQueryClient();
  return useMutation<
    Asset,
    ApiError,
    { assetTag: string; name: string; assetType: AssetType; serialNumber?: string; purchaseDate?: string; warrantyExpires?: string }
  >({
    mutationFn: (body) => apiFetch(SERVICE_URLS.onboarding, '/assets', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['assets'] }),
  });
}

export function useUpdateAsset(id: string | null) {
  const qc = useQueryClient();
  return useMutation<Asset, ApiError, { status?: AssetStatus; assignedToUserId?: string | null }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.onboarding, `/assets/${id}`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['asset', id] });
      qc.invalidateQueries({ queryKey: ['assets'] });
    },
  });
}

export function useLinkAssetTicket() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, { assetId: string; ticketId: string; ticketKey: string }>({
    mutationFn: ({ assetId, ticketId, ticketKey }) =>
      apiFetch(SERVICE_URLS.onboarding, `/assets/${assetId}/link-ticket`, {
        method: 'POST',
        body: JSON.stringify({ ticketId, ticketKey }),
      }),
    onSuccess: (_data, vars) => {
      qc.invalidateQueries({ queryKey: ['asset', vars.assetId] });
      qc.invalidateQueries({ queryKey: ['assetsByTicket', vars.ticketId] });
    },
  });
}

export function useAssetsByTicket(ticketId: string | null) {
  return useQuery<LinkedAsset[], ApiError>({
    queryKey: ['assetsByTicket', ticketId],
    queryFn: () => apiFetch(SERVICE_URLS.onboarding, `/assets/by-ticket/${ticketId}`),
    enabled: !!ticketId,
  });
}
