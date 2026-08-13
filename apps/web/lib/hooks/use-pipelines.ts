// Wraps services/cicd's pipelines + runs endpoints. See RunsService's
// docblock: triggering a run returns immediately (queued), execution
// happens async against real `docker run` steps — so the run-detail hook
// below polls while the run is in flight.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface Pipeline {
  id: string;
  repo_name: string;
  name: string;
  yaml_definition: string;
}

export interface PipelineRunStep {
  id: string;
  step_name: string;
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'waiting_approval';
  log: string;
  exit_code: number | null;
  is_approval_gate: boolean;
  approved_by_user_id: string | null;
  approved_at: string | null;
}

export interface PipelineRun {
  id: string;
  pipeline_id: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'waiting_approval';
  commit_ref: string;
  started_at: string;
  completed_at: string | null;
  steps?: PipelineRunStep[];
}

export function usePipelines(repoName: string | null) {
  return useQuery<Pipeline[], ApiError>({
    queryKey: ['pipelines', repoName],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/pipelines?repoName=${repoName}`),
    enabled: !!repoName,
  });
}

export function useCreatePipeline(repoName: string | null) {
  const qc = useQueryClient();
  return useMutation<Pipeline, ApiError, { name: string; yamlDefinition: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.cicd, '/pipelines', { method: 'POST', body: JSON.stringify({ repoName, ...body }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelines', repoName] }),
  });
}

export function useRuns(pipelineId: string | null) {
  return useQuery<PipelineRun[], ApiError>({
    queryKey: ['runs', pipelineId],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/pipelines/${pipelineId}/runs`),
    enabled: !!pipelineId,
    refetchInterval: 5_000, // a running pipeline's status changes fast; short poll while this list is open
  });
}

export function useRun(pipelineId: string | null, runId: string | null) {
  return useQuery<PipelineRun, ApiError>({
    queryKey: ['run', runId],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, `/pipelines/${pipelineId}/runs/${runId}`),
    enabled: !!pipelineId && !!runId,
    // Keep polling while paused on a manual approval gate too — the run
    // sits in 'waiting_approval' for as long as a human takes to decide,
    // which could be well past a short fixed timeout, so this isn't
    // "still executing" in the same sense as 'running'/'queued' but still
    // needs to catch a decision made from elsewhere (e.g. another tab).
    refetchInterval: (query) =>
      ['running', 'queued', 'waiting_approval'].includes(query.state.data?.status ?? '') ? 2_000 : false,
  });
}

// decideApproval takes {stepId} in variables (not runId) so a run-detail
// page with exactly one live approval gate at a time can key its
// isPending/variables state off the step being decided.
export function useDecideApproval(pipelineId: string | null, runId: string | null) {
  const qc = useQueryClient();
  return useMutation<{ decided: boolean; approved: boolean }, ApiError, { stepId: string; approved: boolean }>({
    mutationFn: ({ stepId, approved }) =>
      apiFetch(SERVICE_URLS.cicd, `/pipelines/${pipelineId}/runs/${runId}/steps/${stepId}/decision`, {
        method: 'POST',
        body: JSON.stringify({ approved }),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['run', runId] }),
  });
}

// --- Pipeline YAML template library (services/cicd's Library module) ---
// Distinct from Task groups (reusable step SEQUENCES referenced from
// inside a pipeline's YAML) — a template is starter YAML copied into the
// create-pipeline form and then edited, not a live reference resolved at
// run time.

export interface PipelineTemplate {
  id: string;
  name: string;
  description: string;
  yamlDefinition: string;
  isBuiltin: boolean;
}

export function usePipelineTemplates() {
  return useQuery<PipelineTemplate[], ApiError>({
    queryKey: ['pipelineTemplates'],
    queryFn: () => apiFetch(SERVICE_URLS.cicd, '/library/pipeline-templates'),
  });
}

export function useSavePipelineTemplate() {
  const qc = useQueryClient();
  return useMutation<PipelineTemplate, ApiError, { name: string; description?: string; yamlDefinition: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.cicd, '/library/pipeline-templates', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['pipelineTemplates'] }),
  });
}

export function useTriggerRun(pipelineId: string | null) {
  const qc = useQueryClient();
  return useMutation<PipelineRun, ApiError, { commitRef?: string }>({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.cicd, `/pipelines/${pipelineId}/runs`, { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['runs', pipelineId] }),
  });
}
