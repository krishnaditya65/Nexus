'use client';

import { useTranslations } from 'next-intl';
import { useRun, useDecideApproval } from '@/lib/hooks/use-pipelines';

const STATUS_KEY: Record<string, string> = {
  pending: 'statusQueued',
  running: 'statusRunning',
  succeeded: 'statusSucceeded',
  failed: 'statusFailed',
  waiting_approval: 'statusWaitingApproval',
};

export default function RunDetailPage({ params }: { params: { pipelineId: string; runId: string } }) {
  const t = useTranslations('pipelines');
  const tCommon = useTranslations('common');
  const { data: run, isLoading, error } = useRun(params.pipelineId, params.runId);
  const decideApproval = useDecideApproval(params.pipelineId, params.runId);

  if (isLoading) return <p className="text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>;
  if (!run) return null;

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('runDetailTitle')}</h1>
      <p className="mb-6 font-mono text-sm text-text-secondary">{run.commit_ref}</p>

      <div className="space-y-4">
        {run.steps?.map((step) => (
          <section key={step.id} className="rounded border border-border bg-surface-raised p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="flex items-center gap-2 font-medium">
                {step.step_name}
                {step.is_approval_gate && (
                  <span className="rounded bg-accent/20 px-2 py-0.5 text-xs text-accent">{t('approvalGate')}</span>
                )}
              </h2>
              <span
                className={
                  step.status === 'succeeded'
                    ? 'text-success'
                    : step.status === 'failed'
                      ? 'text-danger'
                      : step.status === 'waiting_approval'
                        ? 'text-accent'
                        : 'text-text-secondary'
                }
              >
                {t(STATUS_KEY[step.status] as any)}
                {step.exit_code != null ? ` (exit ${step.exit_code})` : ''}
              </span>
            </div>

            {step.is_approval_gate && step.status === 'waiting_approval' && (
              <div className="mb-2 flex items-center gap-2">
                <button
                  onClick={() => decideApproval.mutate({ stepId: step.id, approved: true })}
                  disabled={decideApproval.isPending}
                  className="rounded bg-success px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {t('approve')}
                </button>
                <button
                  onClick={() => decideApproval.mutate({ stepId: step.id, approved: false })}
                  disabled={decideApproval.isPending}
                  className="rounded bg-danger px-3 py-1 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {t('reject')}
                </button>
              </div>
            )}
            {step.is_approval_gate && step.approved_at && (
              <p className="mb-2 text-xs text-text-secondary">
                {t('decidedAt', { date: new Date(step.approved_at).toLocaleString() })}
              </p>
            )}
            {decideApproval.isError && decideApproval.variables?.stepId === step.id && (
              <p role="alert" className="mb-2 text-xs text-danger">
                {decideApproval.error.message}
              </p>
            )}

            {!step.is_approval_gate && (
              <>
                <p className="mb-1 text-xs text-text-secondary">{t('stepLog')}</p>
                <pre className="max-h-64 overflow-auto rounded bg-surface p-2 font-mono text-xs whitespace-pre-wrap">
                  {step.log || '—'}
                </pre>
              </>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
