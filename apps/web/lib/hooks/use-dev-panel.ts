// Development Panel (docs/FEATURES.md §13.5) — wraps services/git-host's
// new cross-repo ticket<->commit/PR correlation endpoint. Ticket keys
// aren't a services/pm concept (pm only stores project.key +
// ticket_number separately); the caller builds "{key}-{ticket_number}"
// itself, the exact same string pm's own UI already displays.
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface LinkedCommit {
  repoName: string;
  commitSha: string;
  commitSubject: string;
  authorEmail: string;
  committedAt: string;
}

export interface LinkedPullRequest {
  repoName: string;
  prId: string;
  title: string;
  status: string;
  isDraft: boolean;
  sourceBranch: string;
  targetBranch: string;
  createdAt: string;
  mergedAt?: string;
}

export interface DevPanel {
  ticketKey: string;
  commits: LinkedCommit[];
  pullRequests: LinkedPullRequest[];
}

export function useDevPanel(ticketKey: string | null) {
  return useQuery<DevPanel, ApiError>({
    queryKey: ['devPanel', ticketKey],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/dev-panel/${ticketKey}`),
    enabled: !!ticketKey,
  });
}

export interface BranchDeployment {
  id: string;
  status: string;
  requested_at: string;
  deployed_at: string | null;
  environment_name: string;
  environment_position: number;
  trafficPercentage: number;
}

/** §13.5 "which environment(s) has this branch reached" — one call per
 *  linked PR's (repoName, sourceBranch), called from the Development
 *  Panel section once it has that PR in hand. */
export function useBranchDeployments(repoName: string | null, branch: string | null) {
  return useQuery<BranchDeployment[], ApiError>({
    queryKey: ['branchDeployments', repoName, branch],
    queryFn: () =>
      apiFetch(SERVICE_URLS.cicd, `/deployments/by-branch?repoName=${repoName}&branch=${encodeURIComponent(branch!)}`),
    enabled: !!repoName && !!branch,
  });
}
