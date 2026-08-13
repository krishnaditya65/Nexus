// Control Chart + Cumulative Flow Diagram (docs/FEATURES.md §13.6) — wraps
// services/bi's flow-metrics endpoints, plus sprint burnup (the other §13.6
// item, living alongside burndown in use-bi.ts's service instead).
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface ControlChartPoint {
  ticketId: string;
  ticketNumber: number;
  title: string;
  doneAt: string;
  leadTimeDays: number;
  cycleTimeDays: number | null;
  isOutlier: boolean;
}

export interface ControlChart {
  projectId: string;
  meanCycleTimeDays: number;
  upperControlLimit: number;
  points: ControlChartPoint[];
}

export function useControlChart(projectId: string | null) {
  return useQuery<ControlChart, ApiError>({
    queryKey: ['controlChart', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.bi, `/flow-metrics/control-chart?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export interface CumulativeFlow {
  projectId: string;
  states: string[];
  series: { date: string; counts: Record<string, number> }[];
}

export function useCumulativeFlow(projectId: string | null) {
  return useQuery<CumulativeFlow, ApiError>({
    queryKey: ['cumulativeFlow', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.bi, `/flow-metrics/cumulative-flow?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export interface BurnupPoint {
  day: number;
  date: string;
  scopePoints: number;
  completedPoints: number;
}

export interface Burnup {
  sprintId: string;
  startDate: string;
  endDate: string;
  series: BurnupPoint[];
}

export function useBurnup(sprintId: string | null) {
  return useQuery<Burnup, ApiError>({
    queryKey: ['burnup', sprintId],
    queryFn: () => apiFetch(SERVICE_URLS.bi, `/sprints/${sprintId}/burnup`),
    enabled: !!sprintId,
  });
}
