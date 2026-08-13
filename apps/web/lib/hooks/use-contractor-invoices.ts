// Wraps services/billing's contractor-invoices endpoints (docs/FEATURES.md
// §11.7 "Contractor invoicing generated from approved timesheets") — a
// real accounts-receivable document the tenant issues to ITS OWN client
// for a contractor's approved hours, distinct from services/billing's
// subscription invoices (what the tenant owes the platform).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface ContractorInvoice {
  id: string;
  contractor_user_id: string;
  timesheet_id: string;
  client_name: string;
  hours: string;
  rate_cents_per_hour: number;
  amount_cents: number;
  status: 'issued' | 'paid' | 'void';
  created_at: string;
}

export function useContractorInvoices() {
  return useQuery<ContractorInvoice[], ApiError>({
    queryKey: ['contractorInvoices'],
    queryFn: () => apiFetch(SERVICE_URLS.billing, '/contractor-invoices'),
  });
}

export function useSetContractorInvoiceStatus() {
  const qc = useQueryClient();
  return useMutation<ContractorInvoice, ApiError, { id: string; status: 'issued' | 'paid' | 'void' }>({
    mutationFn: ({ id, status }) =>
      apiFetch(SERVICE_URLS.billing, `/contractor-invoices/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['contractorInvoices'] }),
  });
}
