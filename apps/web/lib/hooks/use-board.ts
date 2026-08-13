// Wraps services/pm's /boards endpoint (see BoardsService's docblock for
// the column/WIP-limit model). sprintId omitted = Kanban board, given =
// Scrum board — the same distinction pm's API itself makes. groupBy
// (§13.2 swimlanes) reshapes the response into rows of columns instead of
// one flat set — see BoardsService.getBoard's docblock for why `groupBy`
// omitted returns the EXACT original `{columns}` shape, unchanged.
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface BoardTicket {
  id: string;
  ticket_number: number;
  title: string;
  type: string;
  state_name: string;
  story_points: string | number | null;
  assignee_user_id: string | null;
  parent_ticket_id: string | null;
}

export interface BoardColumn {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  ticketCount: number;
  wipViolation: boolean;
  tickets: BoardTicket[];
}

export interface Swimlane {
  key: string;
  label: string | null;
  columns: BoardColumn[];
}

export type BoardResponse = { columns: BoardColumn[] } | { groupBy: 'assignee' | 'epic'; swimlanes: Swimlane[] };

export function useBoard(projectId: string | null, sprintId?: string | null, groupBy?: 'assignee' | 'epic' | null) {
  return useQuery<BoardResponse, ApiError>({
    queryKey: ['board', projectId, sprintId, groupBy],
    queryFn: () =>
      apiFetch(
        SERVICE_URLS.pm,
        `/boards?projectId=${projectId}${sprintId ? `&sprintId=${sprintId}` : ''}${groupBy ? `&groupBy=${groupBy}` : ''}`,
      ),
    enabled: !!projectId,
    // A board is exactly the kind of view someone leaves open on a second
    // monitor during standup — refetch periodically rather than requiring
    // a manual reload to see a teammate's card move.
    refetchInterval: 15_000,
  });
}
