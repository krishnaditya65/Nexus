'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useEnvironments,
  useCreateEnvironment,
  useDeployments,
  useRequestDeployment,
  useApproveDeployment,
  useRejectDeployment,
  usePromoteCanaryStage,
  useCutoverDeployment,
  useRollbackDeployment,
  useRecordDeploymentMetric,
  currentTrafficPercentage,
  DeploymentStrategy,
} from '@/lib/hooks/use-environments';

const STATUS_KEY: Record<string, string> = {
  pending_approval: 'statusPendingApproval',
  approved: 'statusApproved',
  rejected: 'statusRejected',
  deployed: 'statusDeployed',
  rolling_out: 'statusRollingOut',
  verifying: 'statusVerifying',
  rolled_back: 'statusRolledBack',
};

function EnvironmentCard({ environment }: { environment: { id: string; name: string; requires_approval: boolean } }) {
  const t = useTranslations('environments');
  const { data: deployments } = useDeployments(environment.id);
  const requestDeployment = useRequestDeployment(environment.id);
  const approve = useApproveDeployment(environment.id);
  const reject = useRejectDeployment(environment.id);
  const promoteStage = usePromoteCanaryStage(environment.id);
  const cutover = useCutoverDeployment(environment.id);
  const rollback = useRollbackDeployment(environment.id);
  const recordMetric = useRecordDeploymentMetric(environment.id);
  const [pipelineRunId, setPipelineRunId] = useState('');
  const [strategy, setStrategy] = useState<DeploymentStrategy>('direct');
  const [autoRollbackThreshold, setAutoRollbackThreshold] = useState('');
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});
  const [rollbackReason, setRollbackReason] = useState<Record<string, string>>({});
  const [metricValue, setMetricValue] = useState<Record<string, string>>({});

  return (
    <section className="rounded border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-medium">{environment.name}</h2>
        {environment.requires_approval && (
          <span className="rounded bg-warn/20 px-2 py-0.5 text-xs text-warn">{t('requiresApprovalLabel')}</span>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          requestDeployment.mutate(
            {
              pipelineRunId,
              strategy,
              canaryStages: strategy === 'canary' ? [10, 50, 100] : undefined,
              autoRollbackErrorRateThreshold: autoRollbackThreshold ? Number(autoRollbackThreshold) : undefined,
            },
            { onSuccess: () => setPipelineRunId('') },
          );
        }}
        className="mb-4 flex flex-wrap gap-2"
      >
        <label htmlFor={`run-id-${environment.id}`} className="sr-only">
          {t('pipelineRunIdPlaceholder')}
        </label>
        <input
          id={`run-id-${environment.id}`}
          className="flex-1 rounded border border-border bg-surface px-2 py-1 font-mono text-xs"
          placeholder={t('pipelineRunIdPlaceholder')}
          value={pipelineRunId}
          onChange={(e) => setPipelineRunId(e.target.value)}
          required
        />
        <label htmlFor={`strategy-${environment.id}`} className="sr-only">
          {t('strategyLabel')}
        </label>
        <select
          id={`strategy-${environment.id}`}
          className="rounded border border-border bg-surface px-2 py-1 text-xs"
          value={strategy}
          onChange={(e) => setStrategy(e.target.value as DeploymentStrategy)}
        >
          <option value="direct">{t('strategyDirect')}</option>
          <option value="canary">{t('strategyCanary')}</option>
          <option value="blue_green">{t('strategyBlueGreen')}</option>
        </select>
        <label htmlFor={`auto-rollback-${environment.id}`} className="sr-only">
          {t('autoRollbackThresholdLabel')}
        </label>
        <input
          id={`auto-rollback-${environment.id}`}
          type="number"
          step="0.1"
          className="w-32 rounded border border-border bg-surface px-2 py-1 text-xs"
          placeholder={t('autoRollbackThresholdPlaceholder')}
          value={autoRollbackThreshold}
          onChange={(e) => setAutoRollbackThreshold(e.target.value)}
        />
        <button
          type="submit"
          disabled={requestDeployment.isPending}
          className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('requestDeployment')}
        </button>
      </form>

      <p className="mb-2 text-sm font-medium text-text-secondary">{t('deploymentsTitle')}</p>
      <ul className="space-y-2">
        {deployments?.map((d) => (
          <li key={d.id} className="rounded border border-border bg-surface p-2 text-xs">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-mono">{d.pipeline_run_id.slice(0, 8)}</span>
              <div className="flex items-center gap-2">
                {d.strategy !== 'direct' && (
                  <span className="rounded bg-surface-raised px-1.5 py-0.5 text-text-secondary">
                    {d.strategy === 'canary' ? t('strategyCanary') : t('strategyBlueGreen')}
                  </span>
                )}
                <span
                  className={
                    d.status === 'deployed'
                      ? 'text-success'
                      : d.status === 'rejected' || d.status === 'rolled_back'
                        ? 'text-danger'
                        : 'text-warn'
                  }
                >
                  {t(STATUS_KEY[d.status] as any)}
                </span>
              </div>
            </div>

            {(d.status === 'rolling_out' || d.status === 'deployed') && d.strategy !== 'direct' && (
              <p className="mb-1 text-text-secondary">{t('trafficPercentage', { pct: currentTrafficPercentage(d) })}</p>
            )}

            {d.auto_rollback_error_rate_threshold != null && (
              <p className="mb-1 text-text-secondary">
                {t('autoRollbackThresholdSet', { pct: d.auto_rollback_error_rate_threshold })}
              </p>
            )}

            {d.auto_rollback_error_rate_threshold != null &&
              (d.status === 'rolling_out' || d.status === 'verifying') && (
                <div className="mb-1 flex items-center gap-2">
                  <label htmlFor={`metric-${d.id}`} className="sr-only">
                    {t('pushErrorRateLabel')}
                  </label>
                  <input
                    id={`metric-${d.id}`}
                    type="number"
                    step="0.1"
                    className="w-24 rounded border border-border bg-surface-raised px-1.5 py-0.5"
                    placeholder={t('pushErrorRateLabel')}
                    value={metricValue[d.id] ?? ''}
                    onChange={(e) => setMetricValue((prev) => ({ ...prev, [d.id]: e.target.value }))}
                  />
                  <button
                    onClick={() =>
                      recordMetric.mutate({
                        deploymentId: d.id,
                        metricName: 'error_rate',
                        value: Number(metricValue[d.id] ?? 0),
                      })
                    }
                    disabled={recordMetric.isPending}
                    className="rounded border border-border px-2 py-0.5 hover:bg-surface-raised disabled:opacity-50"
                  >
                    {t('pushErrorRate')}
                  </button>
                </div>
              )}
            {recordMetric.isSuccess && recordMetric.variables?.deploymentId === d.id && recordMetric.data?.autoRolledBack && (
              <p role="alert" className="mb-1 text-danger">
                {t('autoRolledBack')}
              </p>
            )}

            {d.status === 'pending_approval' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => approve.mutate(d.id)}
                  className="rounded bg-success/20 px-2 py-0.5 text-success hover:bg-success/30"
                >
                  {t('approve')}
                </button>
                <input
                  className="flex-1 rounded border border-border bg-surface-raised px-1.5 py-0.5"
                  placeholder={t('rejectReasonPlaceholder')}
                  value={rejectReason[d.id] ?? ''}
                  onChange={(e) => setRejectReason((prev) => ({ ...prev, [d.id]: e.target.value }))}
                />
                <button
                  onClick={() => reject.mutate({ deploymentId: d.id, reason: rejectReason[d.id] ?? '' })}
                  className="rounded bg-danger/20 px-2 py-0.5 text-danger hover:bg-danger/30"
                >
                  {t('reject')}
                </button>
              </div>
            )}

            {d.status === 'rolling_out' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => promoteStage.mutate(d.id)}
                  className="rounded bg-success/20 px-2 py-0.5 text-success hover:bg-success/30"
                >
                  {t('promoteStage')}
                </button>
                <input
                  className="flex-1 rounded border border-border bg-surface-raised px-1.5 py-0.5"
                  placeholder={t('rollbackReasonPlaceholder')}
                  value={rollbackReason[d.id] ?? ''}
                  onChange={(e) => setRollbackReason((prev) => ({ ...prev, [d.id]: e.target.value }))}
                />
                <button
                  onClick={() => rollback.mutate({ deploymentId: d.id, reason: rollbackReason[d.id] ?? '' })}
                  className="rounded bg-danger/20 px-2 py-0.5 text-danger hover:bg-danger/30"
                >
                  {t('rollback')}
                </button>
              </div>
            )}

            {d.status === 'verifying' && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => cutover.mutate(d.id)}
                  className="rounded bg-success/20 px-2 py-0.5 text-success hover:bg-success/30"
                >
                  {t('cutover')}
                </button>
                <input
                  className="flex-1 rounded border border-border bg-surface-raised px-1.5 py-0.5"
                  placeholder={t('rollbackReasonPlaceholder')}
                  value={rollbackReason[d.id] ?? ''}
                  onChange={(e) => setRollbackReason((prev) => ({ ...prev, [d.id]: e.target.value }))}
                />
                <button
                  onClick={() => rollback.mutate({ deploymentId: d.id, reason: rollbackReason[d.id] ?? '' })}
                  className="rounded bg-danger/20 px-2 py-0.5 text-danger hover:bg-danger/30"
                >
                  {t('rollback')}
                </button>
              </div>
            )}

            {d.rejection_reason && <p className="mt-1 text-text-secondary">{d.rejection_reason}</p>}
            {d.rollback_reason && <p className="mt-1 text-text-secondary">{d.rollback_reason}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function EnvironmentsPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('environments');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: environments, isLoading, error } = useEnvironments(repoName);
  const createEnvironment = useCreateEnvironment(repoName);
  const [name, setName] = useState('');
  const [requiresApproval, setRequiresApproval] = useState(false);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title', { repoName })}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <div className="mb-6 space-y-3">
        {environments?.map((env) => (
          <EnvironmentCard key={env.id} environment={env} />
        ))}
        {environments?.length === 0 && <p className="text-text-secondary">{t('empty')}</p>}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createEnvironment.mutate({ name, requiresApproval }, { onSuccess: () => setName('') });
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="env-name" className="sr-only">
          {t('namePlaceholder')}
        </label>
        <input
          id="env-name"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label className="flex items-center gap-1 text-xs text-text-secondary">
          <input type="checkbox" checked={requiresApproval} onChange={(e) => setRequiresApproval(e.target.checked)} />
          {t('requiresApprovalLabel')}
        </label>
        <button
          type="submit"
          disabled={createEnvironment.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
