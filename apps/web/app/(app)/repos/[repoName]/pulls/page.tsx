'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  usePullRequests,
  useMergePullRequest,
  useCreatePullRequest,
  useMarkPullRequestReady,
  useBranches,
  usePullRequestReview,
  useSuggestedReviewers,
  useAddPrComment,
  type MergeStrategy,
} from '@/lib/hooks/use-repos';

function PrReviewPanel({ repoName, pullId }: { repoName: string; pullId: string }) {
  const t = useTranslations('pulls');
  const { data: review, isLoading, error } = usePullRequestReview(repoName, pullId);
  const addComment = useAddPrComment(repoName);

  if (isLoading) return <p className="text-xs text-text-secondary">{t('reviewLoading')}</p>;
  if (error) return <p className="text-xs text-danger">{error.message}</p>;
  if (!review) return null;

  const commentBody = `${review.summary}${review.flags.length ? `\n\n${review.flags.map((f) => `⚠️ ${f}`).join('\n')}` : ''}`;

  return (
    <div className="mt-2 rounded border border-border bg-surface-raised p-3 text-xs">
      <p className="mb-1 font-medium">{review.summary}</p>
      {review.flags.map((f, i) => (
        <p key={i} className="text-warn">
          ⚠️ {f}
        </p>
      ))}
      {review.flags.length === 0 && <p className="text-text-secondary">{t('reviewNoFlags')}</p>}
      <button
        onClick={() => addComment.mutate({ pullId, body: commentBody })}
        disabled={addComment.isPending}
        className="mt-2 rounded border border-border px-2 py-1 text-xs hover:bg-surface disabled:opacity-50"
      >
        {addComment.isSuccess ? t('reviewPosted') : t('reviewPostAsComment')}
      </button>
      <SuggestedReviewersPanel repoName={repoName} pullId={pullId} />
    </div>
  );
}

function SuggestedReviewersPanel({ repoName, pullId }: { repoName: string; pullId: string }) {
  const t = useTranslations('pulls');
  const { data: suggestions, isLoading } = useSuggestedReviewers(repoName, pullId);

  if (isLoading) return null;
  if (!suggestions || suggestions.length === 0) {
    return <p className="mt-2 border-t border-border pt-2 text-text-secondary">{t('noSuggestedReviewers')}</p>;
  }

  return (
    <div className="mt-2 border-t border-border pt-2">
      <p className="mb-1 font-medium">{t('suggestedReviewersHeading')}</p>
      <ul className="space-y-0.5">
        {suggestions.slice(0, 5).map((s) => (
          <li key={s.authorEmail} className="flex justify-between text-text-secondary">
            <span>
              {s.authorName} <span className="font-mono">({s.authorEmail})</span>
            </span>
            <span>{t('blameLineCount', { count: s.blameLines })}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STRATEGIES: MergeStrategy[] = ['merge', 'squash', 'rebase'];

export default function PullRequestsPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('pulls');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: pulls, isLoading, error } = usePullRequests(repoName);
  const { data: branches } = useBranches(repoName);
  const mergePr = useMergePullRequest(repoName);
  const markReady = useMarkPullRequestReady(repoName);
  const createPr = useCreatePullRequest(repoName);

  const [strategies, setStrategies] = useState<Record<string, MergeStrategy>>({});
  const [expandedReview, setExpandedReview] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceBranch, setSourceBranch] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [isDraft, setIsDraft] = useState(false);

  const statusLabel = (status: string) =>
    status === 'open' ? t('statusOpen') : status === 'merged' ? t('statusMerged') : t('statusClosed');

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !sourceBranch || !targetBranch) return;
    createPr.mutate(
      { title, description, sourceBranch, targetBranch, isDraft },
      {
        onSuccess: () => {
          setShowCreate(false);
          setTitle('');
          setDescription('');
          setSourceBranch('');
          setTargetBranch('');
          setIsDraft(false);
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title', { repoName })}</h1>
        <button
          onClick={() => setShowCreate((v) => !v)}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {t('newPullRequest')}
        </button>
      </div>

      {showCreate && (
        <form onSubmit={submitCreate} className="mb-6 space-y-3 rounded border border-border p-4">
          <div>
            <label className="mb-1 block text-sm font-medium">{t('prTitleLabel')}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">{t('prDescriptionLabel')}</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
              rows={2}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium">{t('sourceBranchLabel')}</label>
              <select
                value={sourceBranch}
                onChange={(e) => setSourceBranch(e.target.value)}
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                required
              >
                <option value="">{t('selectBranch')}</option>
                {branches?.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium">{t('targetBranchLabel')}</label>
              <select
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full rounded border border-border bg-surface px-2 py-1.5 text-sm"
                required
              >
                <option value="">{t('selectBranch')}</option>
                {branches?.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDraft} onChange={(e) => setIsDraft(e.target.checked)} />
            {t('createAsDraft')}
          </label>
          {createPr.isError && <p className="text-xs text-danger">{createPr.error.message}</p>}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={createPr.isPending}
              className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('create')}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised"
            >
              {tCommon('cancel')}
            </button>
          </div>
        </form>
      )}

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {pulls?.map((pr) => {
          const strategy = strategies[pr.id] ?? 'merge';
          return (
            <li key={pr.id} className="px-4 py-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="flex items-center gap-2 font-medium">
                  {pr.title}
                  {pr.isDraft && (
                    <span className="rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
                      {t('draft')}
                    </span>
                  )}
                </span>
                <span
                  className={`rounded px-2 py-0.5 text-xs ${
                    pr.status === 'open'
                      ? 'bg-accent/20 text-accent'
                      : pr.status === 'merged'
                        ? 'bg-success/20 text-success'
                        : 'bg-surface-raised text-text-secondary'
                  }`}
                >
                  {statusLabel(pr.status)}
                </span>
              </div>
              <p className="mb-2 font-mono text-xs text-text-secondary">
                {pr.sourceBranch} → {pr.targetBranch}
              </p>
              {pr.description && <p className="mb-2 text-sm text-text-secondary">{pr.description}</p>}
              {pr.status === 'open' && (
                <button
                  onClick={() => setExpandedReview(expandedReview === pr.id ? null : pr.id)}
                  className="mb-2 rounded border border-border px-2 py-1 text-xs hover:bg-surface-raised"
                >
                  {t('aiReview')}
                </button>
              )}
              {expandedReview === pr.id && <PrReviewPanel repoName={repoName} pullId={pr.id} />}
              {pr.status === 'open' && pr.isDraft && (
                <button
                  onClick={() => markReady.mutate(pr.id)}
                  disabled={markReady.isPending}
                  className="rounded border border-border px-3 py-1 text-xs font-medium hover:bg-surface-raised disabled:opacity-50"
                >
                  {t('markReady')}
                </button>
              )}
              {pr.status === 'open' && !pr.isDraft && (
                <div className="flex items-center gap-2">
                  <select
                    value={strategy}
                    onChange={(e) => setStrategies((s) => ({ ...s, [pr.id]: e.target.value as MergeStrategy }))}
                    className="rounded border border-border bg-surface px-2 py-1 text-xs"
                  >
                    {STRATEGIES.map((s) => (
                      <option key={s} value={s}>
                        {t(`strategy_${s}` as 'strategy_merge')}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => mergePr.mutate({ id: pr.id, strategy })}
                    disabled={mergePr.isPending}
                    className="rounded bg-accent px-3 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {t('merge')}
                  </button>
                </div>
              )}
              {mergePr.isError && mergePr.variables?.id === pr.id && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {t('mergeConflict')}
                </p>
              )}
              {mergePr.isSuccess && mergePr.variables?.id === pr.id && mergePr.data?.merged === false && (
                <p role="alert" className="mt-2 text-xs text-danger">
                  {mergePr.data.reason}
                </p>
              )}
            </li>
          );
        })}
        {pulls?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
