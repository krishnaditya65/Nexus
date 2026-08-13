// Wraps services/pm's team-planner endpoints — capacity vs allocated work
// per sprint, in story points (see team-planner.service.ts's docblock for
// why points rather than hours+days-off like ADO's own Team Planner).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface CapacityEntry {
  userId: string;
  capacityPoints: number;
  allocatedPoints: number;
  ticketCount: number;
  isOverallocated: boolean;
}

export function useTeamPlan(sprintId: string | null) {
  return useQuery<CapacityEntry[], ApiError>({
    queryKey: ['teamPlan', sprintId],
    queryFn: () => apiFetch(SERVICE_URLS.pm, `/team-planner/${sprintId}`),
    enabled: !!sprintId,
  });
}

export function useSetCapacity(sprintId: string | null) {
  const qc = useQueryClient();
  return useMutation<CapacityEntry, ApiError, { userId: string; capacityPoints: number }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.pm, '/team-planner/capacity', { method: 'POST', body: JSON.stringify({ ...body, sprintId }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['teamPlan', sprintId] }),
  });
}

export interface PortfolioCapacityProject {
  projectId: string;
  projectName: string;
  sprintId: string | null;
  sprintName: string | null;
  capacityPoints: number | null;
  allocatedPoints: number | null;
}

export interface PortfolioCapacityRollup {
  projectCount: number;
  projectsWithActiveSprint: number;
  totalCapacityPoints: number;
  totalAllocatedPoints: number;
  perProject: PortfolioCapacityProject[];
}

// §12.9 cross-project capacity rollup — each project's currently ACTIVE
// sprint only (see TeamPlannerService.portfolioCapacityRollup's docblock
// for why that's an unambiguous concept, not a heuristic); a project
// between sprints or that hasn't started one yet is listed with
// sprintId: null and excluded from the totals, not silently dropped.
export function usePortfolioCapacityRollup() {
  return useQuery<PortfolioCapacityRollup, ApiError>({
    queryKey: ['portfolioCapacityRollup'],
    queryFn: () => apiFetch(SERVICE_URLS.pm, '/team-planner/portfolio-capacity'),
  });
}
