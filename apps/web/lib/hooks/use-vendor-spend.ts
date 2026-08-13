// Wraps services/billing's vendor-subscriptions endpoints (docs/FEATURES.md
// §11.7 "Vendor/subscription spend tracking") — what the tenant pays OUT
// to third-party SaaS, distinct from services/billing's own plans/
// invoices (what the tenant pays IN for using this platform).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface VendorSubscription {
  id: string;
  vendor_name: string;
  category: string;
  monthly_cost_cents: number;
  currency: string;
  renewal_date: string | null;
  notes: string;
}

export interface VendorSpendSummary {
  totalMonthlyCents: number;
  byCategory: { category: string; total_cents: number; vendor_count: number }[];
}

export function useVendorSubscriptions() {
  return useQuery<VendorSubscription[], ApiError>({
    queryKey: ['vendorSubscriptions'],
    queryFn: () => apiFetch(SERVICE_URLS.billing, '/vendor-subscriptions'),
  });
}

export function useVendorSpendSummary() {
  return useQuery<VendorSpendSummary, ApiError>({
    queryKey: ['vendorSpendSummary'],
    queryFn: () => apiFetch(SERVICE_URLS.billing, '/vendor-subscriptions/summary'),
  });
}

export function useAddVendorSubscription() {
  const qc = useQueryClient();
  return useMutation<
    VendorSubscription,
    ApiError,
    { vendorName: string; category?: string; monthlyCostCents: number; renewalDate?: string; notes?: string }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.billing, '/vendor-subscriptions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendorSubscriptions'] });
      qc.invalidateQueries({ queryKey: ['vendorSpendSummary'] });
    },
  });
}

export function useRemoveVendorSubscription() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.billing, `/vendor-subscriptions/${id}`, { method: 'DELETE' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['vendorSubscriptions'] });
      qc.invalidateQueries({ queryKey: ['vendorSpendSummary'] });
    },
  });
}
