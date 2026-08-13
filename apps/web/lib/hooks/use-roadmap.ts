// Advanced Roadmaps auto-scheduling (docs/FEATURES.md §13.4) — wraps
// services/pm's roadmap.controller.ts. See auto-schedule.ts's docblock
// for the algorithm (topological ordering + greedy capacity bin-packing);
// this hook only covers preview/apply.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface ScheduledEpicPreview {
  epicId: string;
  epicTitle: string;
  projectKey: string;
  startDate: string;
  endDate: string;
}

export interface AutoScheduleResponse {
  schedule: ScheduledEpicPreview[];
  warnings: string[];
  velocityPerSprint?: number;
  sprintLengthDays?: number;
}

export function useAutoSchedulePreview(planId: string | null, options: { sprintLengthDays?: number; velocityOverride?: number } = {}) {
  const params = new URLSearchParams();
  if (options.sprintLengthDays) params.set('sprintLengthDays', String(options.sprintLengthDays));
  if (options.velocityOverride != null) params.set('velocityOverride', String(options.velocityOverride));
  const qs = params.toString();
  return useQuery<AutoScheduleResponse, ApiError>({
    queryKey: ['autoSchedulePreview', planId, options.sprintLengthDays, options.velocityOverride],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/delivery-plans/${planId}/auto-schedule${qs ? `?${qs}` : ''}`),
    enabled: !!planId,
  });
}

export function useApplyAutoSchedule(planId: string | null) {
  const qc = useQueryClient();
  return useMutation<AutoScheduleResponse, ApiError, { sprintLengthDays?: number; velocityOverride?: number }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, `/delivery-plans/${planId}/auto-schedule/apply`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['epics'] });
      qc.invalidateQueries({ queryKey: ['autoSchedulePreview', planId] });
    },
  });
}

// --- Epic Gantt timeline (§13.4/§11.2) ---

export interface EpicRollup {
  epicId: string;
  epicTitle: string;
  totalCount: number;
  doneCount: number;
  percentCompleteByCount: number;
  totalPoints: number;
  dueDate: string | null;
  createdAt: string;
}

export function useEpicRollups(projectId: string | null) {
  return useQuery<EpicRollup[], ApiError>({
    queryKey: ['epics', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/epics?projectId=${projectId}`),
    enabled: !!projectId,
  });
}
