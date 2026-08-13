// Wraps git-host's REST surface (Go, cmd/server/main.go) — repos are
// listed/created under /api/repos, PRs under /api/repos/{repo}/pulls.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface PullRequest {
  id: string;
  repoName: string;
  title: string;
  description: string;
  sourceBranch: string;
  targetBranch: string;
  status: 'open' | 'merged' | 'closed';
  isDraft: boolean;
  authorUserId: string;
  createdAt: string;
  mergedAt?: string;
}

export type MergeStrategy = 'merge' | 'squash' | 'rebase';

export function useRepos() {
  return useQuery<string[], ApiError>({
    queryKey: ['repos'],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, '/api/repos'),
  });
}

export function useCreateRepo() {
  const qc = useQueryClient();
  return useMutation<{ name: string; cloneUrl: string }, ApiError, { name: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.gitHost, '/api/repos', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['repos'] }),
  });
}

export function usePullRequests(repoName: string | null) {
  return useQuery<PullRequest[], ApiError>({
    queryKey: ['pulls', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls`),
    enabled: !!repoName,
  });
}

export function useCreatePullRequest(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<
    PullRequest,
    ApiError,
    { title: string; description: string; sourceBranch: string; targetBranch: string; isDraft: boolean }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulls', repoName] }),
  });
}

// mergePullRequest and markPullRequestReady take {id} in variables so a
// list of PRs can share one mutation instance without racing each other's
// isPending/variables state across different PR rows.
export function useMergePullRequest(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<{ merged: boolean; reason?: string }, ApiError, { id: string; strategy: MergeStrategy }>({
    mutationFn: ({ id, strategy }) =>
      apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls/${id}/merge`, {
        method: 'POST',
        body: JSON.stringify({ strategy }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulls', repoName] }),
  });
}

export function useMarkPullRequestReady(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, string>({
    mutationFn: (pullId) =>
      apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls/${pullId}/ready`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pulls', repoName] }),
  });
}

export interface PrFileChange {
  path: string;
  insertions: number;
  deletions: number;
}

export interface PrReview {
  filesChanged: number;
  insertions: number;
  deletions: number;
  files: PrFileChange[];
  flags: string[];
  summary: string;
}

// §11.8 "AI PR review assistant" — a real `git diff --numstat` between the
// PR's branches, summarized by deterministic heuristics (see
// internal/pullrequests/review.go's docblock: no LLM configured in this
// repo, so this is honest heuristics, not fabricated "AI" prose).
export function usePullRequestReview(repoName: string | null, pullId: string | null) {
  return useQuery<PrReview, ApiError>({
    queryKey: ['pull-review', repoName, pullId],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls/${pullId}/review`),
    enabled: !!repoName && !!pullId,
  });
}

export interface ReviewerSuggestion {
  authorEmail: string;
  authorName: string;
  blameLines: number;
}

// §11.8 "git-blame-informed assignee suggestion" — ranks candidates by
// real git-blame ownership of the PR's touched files on the target
// branch (see internal/pullrequests/review.go's SuggestReviewers
// docblock for why target, not source).
export function useSuggestedReviewers(repoName: string | null, pullId: string | null) {
  return useQuery<ReviewerSuggestion[], ApiError>({
    queryKey: ['suggested-reviewers', repoName, pullId],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls/${pullId}/suggested-reviewers`),
    enabled: !!repoName && !!pullId,
  });
}

export function useAddPrComment(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<{ status: string }, ApiError, { pullId: string; body: string }>({
    mutationFn: ({ pullId, body }) =>
      apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/pulls/${pullId}/comments`, {
        method: 'POST',
        body: JSON.stringify({ body }),
      }),
    onSuccess: (_data, { pullId }) => qc.invalidateQueries({ queryKey: ['pull-review', repoName, pullId] }),
  });
}

// --- Code browsing (services/git-host/internal/browse) ---
// A ref of '' means "server picks the repo's default branch" — every hook
// below passes that through as-is rather than pre-resolving it client-side,
// matching how the backend's resolveRef works.

export interface Branch {
  name: string;
  commitSha: string;
  isDefault: boolean;
}

export interface TreeEntry {
  name: string;
  path: string;
  type: 'blob' | 'tree';
  size?: number;
  sha: string;
}

export interface Commit {
  sha: string;
  author: string;
  email: string;
  date: string;
  subject: string;
}

export function useBranches(repoName: string | null) {
  return useQuery<Branch[], ApiError>({
    queryKey: ['branches', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/branches`),
    enabled: !!repoName,
  });
}

export function useTags(repoName: string | null) {
  return useQuery<string[], ApiError>({
    queryKey: ['tags', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/tags`),
    enabled: !!repoName,
  });
}

export function useTree(repoName: string | null, ref: string, path: string) {
  return useQuery<{ ref: string; entries: TreeEntry[] }, ApiError>({
    queryKey: ['tree', repoName, ref, path],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (ref) qs.set('ref', ref);
      if (path) qs.set('path', path);
      return apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/tree?${qs}`);
    },
    enabled: !!repoName,
  });
}

export function useBlob(repoName: string | null, ref: string, path: string | null) {
  return useQuery<{ ref: string; path: string; content: string }, ApiError>({
    queryKey: ['blob', repoName, ref, path],
    queryFn: () => {
      const qs = new URLSearchParams({ path: path ?? '' });
      if (ref) qs.set('ref', ref);
      return apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/blob?${qs}`);
    },
    enabled: !!repoName && !!path,
  });
}

export function useCommits(repoName: string | null, ref: string, path: string) {
  return useQuery<Commit[], ApiError>({
    queryKey: ['commits', repoName, ref, path],
    queryFn: () => {
      const qs = new URLSearchParams();
      if (ref) qs.set('ref', ref);
      if (path) qs.set('path', path);
      return apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/commits?${qs}`);
    },
    enabled: !!repoName,
  });
}

export interface BlameLine {
  lineNumber: number;
  sha: string;
  author: string;
  authorTime: string;
  summary: string;
  content: string;
}

export function useBlame(repoName: string | null, ref: string, path: string | null) {
  return useQuery<{ path: string; ref: string; lines: BlameLine[] }, ApiError>({
    queryKey: ['blame', repoName, ref, path],
    queryFn: () => {
      const qs = new URLSearchParams({ path: path ?? '' });
      if (ref) qs.set('ref', ref);
      return apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/blame?${qs}`);
    },
    enabled: !!repoName && !!path,
  });
}

// --- Cross-repo code search (services/git-host's `git grep -F` fan-out
// across every repo the tenant owns) — a live query, not a stored/indexed
// scan, so it's only fetched on explicit submit (see code-search/page.tsx),
// never on keystroke.

export interface CodeSearchMatch {
  repoName: string;
  filePath: string;
  lineNumber: number;
  line: string;
}

export function useCodeSearch(query: string, enabled: boolean) {
  return useQuery<CodeSearchMatch[], ApiError>({
    queryKey: ['codeSearch', query],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/code-search?q=${encodeURIComponent(query)}`),
    enabled,
  });
}

// --- Branch protection (Project settings > Repositories) ---

export interface BranchProtectionRule {
  id: string;
  repoName: string;
  branchPattern: string;
  requireReviewsCount: number;
  requireCodeownerReview: boolean;
}

export function useBranchProtectionRules(repoName: string | null) {
  return useQuery<BranchProtectionRule[], ApiError>({
    queryKey: ['branchProtection', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/branch-protection`),
    enabled: !!repoName,
  });
}

export function useUpsertBranchProtectionRule(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<
    BranchProtectionRule,
    ApiError,
    { branchPattern: string; requireReviewsCount: number; requireCodeownerReview: boolean }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/branch-protection`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branchProtection', repoName] }),
  });
}

// --- Branch-level RBAC beyond CODEOWNERS (docs/FEATURES.md §11.1) — an
// explicit per-pattern merge allowlist, distinct from the review-count
// rule above. See services/git-host's branchprotection/allowlist.go
// docblock. ---

export interface BranchAllowlistEntry {
  id: string;
  repoName: string;
  branchPattern: string;
  userId: string;
}

export function useBranchAllowlist(repoName: string | null) {
  return useQuery<BranchAllowlistEntry[], ApiError>({
    queryKey: ['branchAllowlist', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/branch-allowlist`),
    enabled: !!repoName,
  });
}

export function useAddBranchAllowlistEntry(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<BranchAllowlistEntry, ApiError, { branchPattern: string; userId: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/branch-allowlist`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branchAllowlist', repoName] }),
  });
}

export function useRemoveBranchAllowlistEntry(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<void, ApiError, { id: string }>({
    mutationFn: ({ id }) => apiFetch(SERVICE_URLS.gitHost, `/api/branch-allowlist/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['branchAllowlist', repoName] }),
  });
}

// --- Advanced Security (secret scanning on push) ---
// Refreshed for a repo's default branch on every push that reaches it —
// see services/git-host/internal/secretscan's docblock: dependency/CVE
// scanning is NOT covered here (would need a real advisory feed), only
// secret scanning is real and live.

export interface SecurityFinding {
  id: string;
  branch: string;
  commitSha: string;
  filePath: string;
  lineNumber: number;
  ruleName: string;
  redactedSnippet: string;
  createdAt: string;
}

export function useSecurityFindings(repoName: string | null) {
  return useQuery<SecurityFinding[], ApiError>({
    queryKey: ['securityFindings', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.gitHost, `/api/repos/${repoName}/security-findings`),
    enabled: !!repoName,
  });
}
