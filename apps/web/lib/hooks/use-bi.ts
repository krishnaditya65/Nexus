// Wraps services/bi's burndown, rate-card, and cost-report endpoints.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface BurndownPoint {
  day: number;
  date: string;
  idealRemaining: number;
  actualRemaining: number;
}

export interface Burndown {
  sprintId: string;
  totalPoints: number;
  startDate: string;
  endDate: string;
  series: BurndownPoint[];
}

export function useBurndown(sprintId: string | null) {
  return useQuery<Burndown, ApiError>({
    queryKey: ['burndown', sprintId],
    queryFn: () => apiFetch(SERVICE_URLS.bi, `/sprints/${sprintId}/burndown`),
    enabled: !!sprintId,
  });
}

// --- Budget estimation from hourly rates × logged time, CapEx/OpEx
// (docs/FEATURES.md §11.7) ---

export interface RateCard {
  user_id: string;
  hourly_rate_cents: number;
  currency: string;
}

export function useRateCards() {
  return useQuery<RateCard[], ApiError>({
    queryKey: ['rateCards'],
    queryFn: () => apiFetch(SERVICE_URLS.bi, '/rate-cards'),
  });
}

export function useSetRateCard() {
  const qc = useQueryClient();
  return useMutation<RateCard, ApiError, { userId: string; hourlyRateCents: number; currency?: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.bi, '/rate-cards', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['rateCards'] }),
  });
}

export interface CostReport {
  projectId: string;
  startDate: string;
  endDate: string;
  totalCostCents: number;
  capexCents: number;
  opexCents: number;
  uncostedMinutes: number;
  byUser: { userId: string; minutes: number; costCents: number }[];
}

export function useCostReport(projectId: string | null, startDate: string, endDate: string, enabled: boolean) {
  return useQuery<CostReport, ApiError>({
    queryKey: ['costReport', projectId, startDate, endDate],
    queryFn: () =>
      apiFetch(SERVICE_URLS.bi, `/cost-report?projectId=${projectId}&startDate=${startDate}&endDate=${endDate}`),
    enabled: enabled && !!projectId && !!startDate && !!endDate,
  });
}

// §12.9 portfolio-level rollup — every project's cost report, summed.
// See CostReportService.portfolioCostReport's docblock for scope.
export interface PortfolioCostReport {
  startDate: string;
  endDate: string;
  projectCount: number;
  totalCostCents: number;
  capexCents: number;
  opexCents: number;
  uncostedMinutes: number;
  byProject: (CostReport & { projectKey: string; projectName: string })[];
}

export function usePortfolioCostReport(startDate: string, endDate: string, enabled: boolean) {
  return useQuery<PortfolioCostReport, ApiError>({
    queryKey: ['portfolioCostReport', startDate, endDate],
    queryFn: () => apiFetch(SERVICE_URLS.bi, `/portfolio-cost-report?startDate=${startDate}&endDate=${endDate}`),
    enabled: enabled && !!startDate && !!endDate,
  });
}

// --- Timesheet approval + contractor invoicing (docs/FEATURES.md §11.7) ---

export interface Timesheet {
  id: string;
  user_id: string;
  week_start_date: string;
  status: 'draft' | 'submitted' | 'approved' | 'rejected';
  submitted_at: string | null;
  approved_by_user_id: string | null;
  approved_at: string | null;
}

export function usePendingTimesheets() {
  return useQuery<Timesheet[], ApiError>({
    queryKey: ['pendingTimesheets'],
    queryFn: () => apiFetch(SERVICE_URLS.bi, '/timesheets/pending-approval'),
  });
}

export function useApproveTimesheet() {
  const qc = useQueryClient();
  return useMutation<Timesheet, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.bi, `/timesheets/${id}/approve`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pendingTimesheets'] }),
  });
}

export function useRejectTimesheet() {
  const qc = useQueryClient();
  return useMutation<Timesheet, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.bi, `/timesheets/${id}/reject`, { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pendingTimesheets'] }),
  });
}

export function useGenerateContractorInvoice() {
  return useMutation<{ id: string; amount_cents: number }, ApiError, { timesheetId: string; clientName: string }>({
    mutationFn: ({ timesheetId, clientName }) =>
      apiFetch(SERVICE_URLS.bi, `/timesheets/${timesheetId}/generate-invoice`, {
        method: 'POST',
        body: JSON.stringify({ clientName }),
      }),
  });
}
