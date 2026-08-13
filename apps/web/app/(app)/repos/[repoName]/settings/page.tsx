'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useBranchProtectionRules,
  useUpsertBranchProtectionRule,
  useBranchAllowlist,
  useAddBranchAllowlistEntry,
  useRemoveBranchAllowlistEntry,
} from '@/lib/hooks/use-repos';

export default function RepoSettingsPage({ params }: { params: { repoName: string } }) {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const repoName = decodeURIComponent(params.repoName);
  const { data: rules, isLoading, error } = useBranchProtectionRules(repoName);
  const upsertRule = useUpsertBranchProtectionRule(repoName);

  const [branchPattern, setBranchPattern] = useState('main');
  const [requireReviewsCount, setRequireReviewsCount] = useState(1);
  const [requireCodeownerReview, setRequireCodeownerReview] = useState(false);

  const { data: allowlist } = useBranchAllowlist(repoName);
  const addAllowlistEntry = useAddBranchAllowlistEntry(repoName);
  const removeAllowlistEntry = useRemoveBranchAllowlistEntry(repoName);
  const [allowlistPattern, setAllowlistPattern] = useState('main');
  const [allowlistUserId, setAllowlistUserId] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('repoSettingsTitle', { repoName })}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('branchProtectionSubtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-6 divide-y divide-border rounded border border-border">
        {rules?.map((rule) => (
          <li key={rule.id} className="px-4 py-3 text-sm">
            <p className="font-mono font-medium">{rule.branchPattern}</p>
            <p className="mt-1 text-xs text-text-secondary">
              {t('requiresReviews', { count: rule.requireReviewsCount })}
              {rule.requireCodeownerReview ? ` · ${t('requiresCodeowner')}` : ''}
            </p>
          </li>
        ))}
        {rules?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyBranchProtection')}</li>}
      </ul>

      <form
        className="rounded border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          upsertRule.mutate({ branchPattern, requireReviewsCount, requireCodeownerReview });
        }}
      >
        <label htmlFor="branch-pattern" className="mb-1 block text-xs font-medium text-text-secondary">
          {t('branchPatternLabel')}
        </label>
        <input
          id="branch-pattern"
          className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder="main"
          value={branchPattern}
          onChange={(e) => setBranchPattern(e.target.value)}
          required
        />
        <label htmlFor="require-reviews" className="mb-1 block text-xs font-medium text-text-secondary">
          {t('requireReviewsLabel')}
        </label>
        <input
          id="require-reviews"
          type="number"
          min={0}
          max={10}
          className="mb-3 w-24 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          value={requireReviewsCount}
          onChange={(e) => setRequireReviewsCount(Number(e.target.value))}
        />
        <label className="mb-3 flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={requireCodeownerReview}
            onChange={(e) => setRequireCodeownerReview(e.target.checked)}
          />
          {t('requireCodeownerLabel')}
        </label>
        <div>
          <button
            type="submit"
            disabled={upsertRule.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('saveRule')}
          </button>
        </div>
      </form>

      <h2 className="mb-1 mt-8 text-sm font-medium">{t('branchAllowlistTitle')}</h2>
      <p className="mb-3 text-xs text-text-secondary">{t('branchAllowlistSubtitle')}</p>
      <ul className="mb-4 divide-y divide-border rounded border border-border">
        {allowlist?.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between px-4 py-2 text-sm">
            <span>
              <code className="font-mono">{entry.branchPattern}</code> — {entry.userId}
            </span>
            <button
              className="text-xs text-danger hover:underline"
              onClick={() => removeAllowlistEntry.mutate({ id: entry.id })}
            >
              {tCommon('delete')}
            </button>
          </li>
        ))}
        {allowlist?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('emptyBranchAllowlist')}</li>}
      </ul>
      <form
        className="flex gap-2 rounded border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (!allowlistUserId.trim()) return;
          addAllowlistEntry.mutate(
            { branchPattern: allowlistPattern, userId: allowlistUserId.trim() },
            { onSuccess: () => setAllowlistUserId('') },
          );
        }}
      >
        <input
          className="w-32 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder="main"
          value={allowlistPattern}
          onChange={(e) => setAllowlistPattern(e.target.value)}
        />
        <input
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('userIdPlaceholder')}
          value={allowlistUserId}
          onChange={(e) => setAllowlistUserId(e.target.value)}
        />
        <button
          type="submit"
          disabled={addAllowlistEntry.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('addToAllowlist')}
        </button>
      </form>
    </div>
  );
}
