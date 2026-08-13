// Wraps services/pm's Delivery Plans — a named, saved cross-project
// sprint timeline. Covers sprint date ranges (human-set, manually
// merged-and-displayed). Epic-level date bars are a separate concept now
// covered by use-roadmap.ts's auto-scheduling (§13.4) and the epic Gantt
// view — genuinely different granularity, not folded into this hook.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface DeliveryPlan {
  id: string;
  name: string;
  project_ids: string[];
  created_by_user_id: string;
  created_at: string;
}

export interface DeliveryPlanLane {
  sprintId: string;
  sprintName: string;
  status: string;
  startDate: string | null;
  endDate: string | null;
  scheduled: boolean;
  projectId: string;
  projectKey: string;
  projectName: string;
}

export interface DeliveryPlanDetail {
  plan: DeliveryPlan;
  lanes: DeliveryPlanLane[];
}

export function useDeliveryPlans() {
  return useQuery<DeliveryPlan[], ApiError>({
    queryKey: ['delivery-plans'],
    queryFn: () => apiFetch(SERVICE_URLS.pm, '/delivery-plans'),
  });
}

export function useDeliveryPlan(id: string | null) {
  return useQuery<DeliveryPlanDetail, ApiError>({
    queryKey: ['delivery-plan', id],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/delivery-plans/${id}`),
    enabled: !!id,
  });
}

export function useCreateDeliveryPlan() {
  const qc = useQueryClient();
  return useMutation<DeliveryPlan, ApiError, { name: string; projectIds: string[] }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, '/delivery-plans', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-plans'] }),
  });
}

export function useDeleteDeliveryPlan() {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, string>({
    mutationFn: (id) => apiFetch(SERVICE_URLS.pm, `/delivery-plans/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['delivery-plans'] }),
  });
}
