// Wraps services/qa's test-plans, test-executions (flaky quarantine), and
// RTM endpoints.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface TestPlan {
  id: string;
  name: string;
  release_ref: string | null;
  created_at: string;
  release?: { id: string; name: string; status: string } | null;
}

export interface TestCase {
  id: string;
  title: string;
  gherkin_text: string | null;
  requirement_ticket_id: string | null;
  parsedGherkin: unknown;
}

export interface RtmRow {
  requirementTicketId: string;
  requirementTitle: string;
  requirementState: string;
  linkedTestCases: { id: string; title: string; latest_status: string | null }[];
  coverageStatus: 'no_tests' | 'fully_passing' | 'has_failures_or_untested';
}

export function useTestPlans(projectId: string | null) {
  return useQuery<TestPlan[], ApiError>({
    queryKey: ['test-plans', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/test-plans?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useCreateTestPlan(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<TestPlan, ApiError, { name: string; releaseRef?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, '/test-plans', { method: 'POST', body: JSON.stringify({ projectId, ...body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test-plans', projectId] }),
  });
}

export function useTestCases(planId: string | null) {
  return useQuery<TestCase[], ApiError>({
    queryKey: ['test-cases', planId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/cases`),
    enabled: !!planId,
  });
}

export function useAddTestCase(planId: string | null) {
  const qc = useQueryClient();
  return useMutation<TestCase, ApiError, { title: string; gherkinText?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/cases`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['test-cases', planId] }),
  });
}

export function useFlakyTests() {
  return useQuery<{ test_case_id: string; title: string }[], ApiError>({
    queryKey: ['flaky-tests'],
    queryFn: () => apiFetch(SERVICE_URLS.qa, '/flaky-tests'),
  });
}

export function useUnquarantine() {
  const qc = useQueryClient();
  return useMutation<unknown, ApiError, string>({
    mutationFn: (testCaseId) =>
      apiFetch(SERVICE_URLS.qa, `/flaky-tests/${testCaseId}/unquarantine`, { method: 'POST', body: '{}' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['flaky-tests'] }),
  });
}

export function useRtm(projectId: string | null) {
  return useQuery<RtmRow[], ApiError>({
    queryKey: ['rtm', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/rtm?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export interface PlanProgress {
  planId: string;
  planName: string;
  passed: number;
  failed: number;
  untested: number;
  total: number;
}

export function useTestPlansProgress(projectId: string | null) {
  return useQuery<PlanProgress[], ApiError>({
    queryKey: ['test-plans-progress', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/test-plans/progress?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export interface ExploratorySession {
  id: string;
  project_id: string;
  charter: string;
  tester_user_id: string;
  status: 'in_progress' | 'completed';
  outcome: 'passed' | 'issues_found' | null;
  started_at: string;
  ended_at: string | null;
}

export interface ExploratoryNote {
  id: string;
  session_id: string;
  note_text: string;
  bug_ticket_id: string | null;
  created_at: string;
}

export function useExploratorySessions(projectId: string | null) {
  return useQuery<ExploratorySession[], ApiError>({
    queryKey: ['exploratory-sessions', projectId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/exploratory-sessions?projectId=${projectId}`),
    enabled: !!projectId,
  });
}

export function useExploratorySession(sessionId: string | null) {
  return useQuery<ExploratorySession, ApiError>({
    queryKey: ['exploratory-session', sessionId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/exploratory-sessions/${sessionId}`),
    enabled: !!sessionId,
  });
}

export function useStartExploratorySession(projectId: string | null) {
  const qc = useQueryClient();
  return useMutation<ExploratorySession, ApiError, { charter: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, '/exploratory-sessions', { method: 'POST', body: JSON.stringify({ projectId, ...body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exploratory-sessions', projectId] }),
  });
}

export function useExploratoryNotes(sessionId: string | null) {
  return useQuery<ExploratoryNote[], ApiError>({
    queryKey: ['exploratory-notes', sessionId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/exploratory-sessions/${sessionId}/notes`),
    enabled: !!sessionId,
  });
}

export function useAddExploratoryNote(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation<ExploratoryNote, ApiError, { noteText: string; bugTicketId?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, `/exploratory-sessions/${sessionId}/notes`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['exploratory-notes', sessionId] }),
  });
}

export function useCompleteExploratorySession(sessionId: string | null) {
  const qc = useQueryClient();
  return useMutation<ExploratorySession, ApiError, { outcome: 'passed' | 'issues_found' }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, `/exploratory-sessions/${sessionId}/complete`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['exploratory-session', sessionId] });
      qc.invalidateQueries({ queryKey: ['exploratory-sessions'] });
    },
  });
}

// --- Load/performance testing (k6 summary JSON ingestion) and
// accessibility (axe-core JSON ingestion) — both follow the same "ingest
// what the real tool emits" pattern JUnit ingestion already established;
// see services/qa/src/load-testing/k6-parser.ts and
// src/accessibility/axe-parser.ts for the actual parsers.

export interface LoadTestRun {
  id: string;
  tool: string;
  vus: number | null;
  iterations: number | null;
  http_req_count: number | null;
  http_req_failed_rate: string | null;
  avg_duration_ms: string | null;
  p95_duration_ms: string | null;
  p99_duration_ms: string | null;
  recorded_at: string;
}

export function useLoadTestRuns(planId: string | null) {
  return useQuery<LoadTestRun[], ApiError>({
    queryKey: ['load-test-runs', planId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/load-tests`),
    enabled: !!planId,
  });
}

export function useIngestLoadTest(planId: string | null) {
  const qc = useQueryClient();
  return useMutation<LoadTestRun, ApiError, { json: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/load-tests`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['load-test-runs', planId] }),
  });
}

export interface AccessibilityViolation {
  id: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  description: string;
  nodeCount: number;
}

export interface AccessibilityAudit {
  id: string;
  url: string | null;
  critical_count: number;
  serious_count: number;
  moderate_count: number;
  minor_count: number;
  violations: AccessibilityViolation[];
  recorded_at: string;
}

export function useAccessibilityAudits(planId: string | null) {
  return useQuery<AccessibilityAudit[], ApiError>({
    queryKey: ['accessibility-audits', planId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/accessibility-audits`),
    enabled: !!planId,
  });
}

export function useIngestAccessibilityAudit(planId: string | null) {
  const qc = useQueryClient();
  return useMutation<AccessibilityAudit, ApiError, { json: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/accessibility-audits`, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['accessibility-audits', planId] }),
  });
}

export interface BrowserMatrixCase {
  testCaseId: string;
  title: string;
  results: Record<string, string>; // '<browser>/<os>' -> 'passed' | 'failed' | 'skipped'
}

export interface BrowserMatrix {
  browsers: string[];
  cases: BrowserMatrixCase[];
}

export function useBrowserMatrix(planId: string | null) {
  return useQuery<BrowserMatrix, ApiError>({
    queryKey: ['browser-matrix', planId],
    queryFn: () => apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/browser-matrix`),
    enabled: !!planId,
  });
}

export function useIngestJUnit(planId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ ingested: number }, ApiError, { xml: string; browser?: string; os?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.qa, `/test-plans/${planId}/ingest-junit`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['browser-matrix', planId] }),
  });
}
