// Wraps services/cicd's environments + deployments endpoints. See
// EnvironmentsService's/DeploymentsService's docblocks for the promotion +
// approval-gate model this renders.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Environment {
  id: string;
  repo_name: string;
  name: string;
  position: number;
  requires_approval: boolean;
}

export type DeploymentStrategy = 'direct' | 'canary' | 'blue_green';

export interface Deployment {
  id: string;
  environment_id: string;
  pipeline_run_id: string;
  status: 'pending_approval' | 'approved' | 'rejected' | 'deployed' | 'rolling_out' | 'verifying' | 'rolled_back';
  requested_by_user_id: string;
  approved_by_user_id: string | null;
  rejection_reason: string | null;
  requested_at: string;
  deployed_at: string | null;
  strategy: DeploymentStrategy;
  canary_stages: number[] | null;
  current_stage_index: number;
  rollback_reason: string | null;
  auto_rollback_error_rate_threshold: string | null; // numeric column comes back as a string over JSON
}

export interface DeploymentMetric {
  id: string;
  deployment_id: string;
  metric_name: string;
  value: string;
  recorded_at: string;
}

/** Mirrors services/cicd's currentTrafficPercentage — pure client-side
 *  restatement, no DB access needed, see that function's docblock for the
 *  traffic-percentage scope note. */
export function currentTrafficPercentage(d: Deployment): number {
  if (d.status === 'deployed') return 100;
  if (d.status === 'rolling_out' && d.canary_stages) return d.canary_stages[d.current_stage_index] ?? 0;
  return 0;
}

export function useEnvironments(repoName: string | null) {
  return useQuery<Environment[], ApiError>({
    queryKey: ['environments', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/environments?repoName=${repoName}`),
    enabled: !!repoName,
  });
}

export function useCreateEnvironment(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<Environment, ApiError, { name: string; requiresApproval: boolean }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.cicd, '/environments', { method: 'POST', body: JSON.stringify({ repoName, ...body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['environments', repoName] }),
  });
}

export function useDeployments(environmentId: string | null) {
  return useQuery<Deployment[], ApiError>({
    queryKey: ['deployments', environmentId],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/deployments?environmentId=${environmentId}`),
    enabled: !!environmentId,
    refetchInterval: 10_000,
  });
}

function useInvalidateDeployments(environmentId: string | null) {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: ['deployments', environmentId] });
}

export function useRequestDeployment(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  return useMutation<
    Deployment,
    ApiError,
    {
      pipelineRunId: string;
      strategy?: DeploymentStrategy;
      canaryStages?: number[];
      autoRollbackErrorRateThreshold?: number;
    }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.cicd, '/deployments', { method: 'POST', body: JSON.stringify({ environmentId, ...body }) }),
    onSuccess: invalidate,
  });
}

export function useApproveDeployment(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  return useMutation<Deployment, ApiError, string>({
    mutationFn: (deploymentId) => apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/approve`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
  });
}

export function useRejectDeployment(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  return useMutation<Deployment, ApiError, { deploymentId: string; reason: string }>({
    mutationFn: ({ deploymentId, reason }) =>
      apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/reject`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  });
}

export function usePromoteCanaryStage(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  return useMutation<Deployment, ApiError, string>({
    mutationFn: (deploymentId) =>
      apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/promote-stage`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
  });
}

export function useCutoverDeployment(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  return useMutation<Deployment, ApiError, string>({
    mutationFn: (deploymentId) =>
      apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/cutover`, { method: 'POST', body: '{}' }),
    onSuccess: invalidate,
  });
}

export function useRollbackDeployment(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  return useMutation<Deployment, ApiError, { deploymentId: string; reason: string }>({
    mutationFn: ({ deploymentId, reason }) =>
      apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/rollback`, { method: 'POST', body: JSON.stringify({ reason }) }),
    onSuccess: invalidate,
  });
}

// --- APM-triggered auto-rollback (docs/FEATURES.md §11.4) — a real
// ingestion endpoint an APM agent/exporter pushes error-rate samples to.
// This session's own live verification used curl in place of a real
// exporter; the endpoint and the threshold check it drives are real.

export function useDeploymentMetrics(deploymentId: string | null) {
  return useQuery<DeploymentMetric[], ApiError>({
    queryKey: ['deploymentMetrics', deploymentId],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/metrics`),
    enabled: !!deploymentId,
    refetchInterval: 10_000,
  });
}

export function useRecordDeploymentMetric(environmentId: string | null) {
  const invalidate = useInvalidateDeployments(environmentId);
  const qc = useQueryClient();
  return useMutation<
    { recorded: boolean; autoRolledBack: boolean; deployment?: Deployment },
    ApiError,
    { deploymentId: string; metricName: string; value: number }
  >({
    mutationFn: ({ deploymentId, metricName, value }) =>
      apiFetch(SERVICE_URLS.cicd, `/deployments/${deploymentId}/metrics`, {
        method: 'POST',
        body: JSON.stringify({ metricName, value }),
      }),
    onSuccess: (_result, { deploymentId }) => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['deploymentMetrics', deploymentId] });
    },
  });
}
