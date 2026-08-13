// Wraps services/pm's dashboard config endpoints. Widgets hold config
// only (which sprint/repo to pull from), never data — see
// dashboards.service.ts's docblock. Each widget component (see
// components/dashboard-widgets.tsx) fetches from the same endpoint a
// dedicated screen for that data source already calls.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type WidgetType =
  | 'ticket_counts_by_state'
  | 'sprint_burndown'
  | 'open_pull_requests'
  | 'flaky_tests'
  | 'team_capacity'
  | 'velocity_trend';

export interface DashboardSummary {
  id: string;
  project_id: string;
  name: string;
  created_by_user_id: string;
  created_at: string;
}

export interface Widget {
  id: string;
  dashboard_id: string;
  widget_type: WidgetType;
  title: string;
  position: number;
  config: Record<string, string>;
}

export interface DashboardDetail extends DashboardSummary {
  widgets: Widget[];
}

export function useDashboards(projectId: string | null) {
  return useQuery<DashboardSummary[], ApiError>({
    queryKey: ['dashboards', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/dashboards?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useDashboard(dashboardId: string | null) {
  return useQuery<DashboardDetail, ApiError>({
    queryKey: ['dashboard', dashboardId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/dashboards/${dashboardId}`),
    enabled: !!dashboardId,
  });
}

export function useCreateDashboard(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<DashboardSummary, ApiError, { name: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/dashboards', { method: 'POST', body: JSON.stringify({ ...body, projectId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboards', projectId] }),
  });
}

export function useAddWidget(dashboardId: string | null) {
  const qc = useQueryClient();
  return useMutation<Widget, ApiError, { widgetType: WidgetType; title: string; config?: Record<string, string> }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.pm, `/dashboards/${dashboardId}/widgets`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] }),
  });
}

export function useRemoveWidget(dashboardId: string | null) {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (widgetId) => apiFetch(SERVICE_URLS.pm, `/dashboards/widgets/${widgetId}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['dashboard', dashboardId] }),
  });
}
