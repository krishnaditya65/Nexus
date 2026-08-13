'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRepos, useCreateRepo } from '@/lib/hooks/use-repos';

export default function ReposPage() {
  const t = useTranslations('repos');
  const tCommon = useTranslations('common');
  const { data: repos, isLoading, error } = useRepos();
  const createRepo = useCreateRepo();
  const [name, setName] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {repos?.map((repoName) => (
          <li key={repoName} className="flex items-center justify-between px-4 py-3">
            <span className="font-mono text-sm">{repoName}</span>
            <div className="flex gap-3 text-sm">
              <Link href={`/repos/${repoName}/files`} className="text-accent hover:underline">
                {t('filesLink')}
              </Link>
              <Link href={`/repos/${repoName}/commits`} className="text-accent hover:underline">
                {t('commitsLink')}
              </Link>
              <Link href={`/repos/${repoName}/branches`} className="text-accent hover:underline">
                {t('branchesLink')}
              </Link>
              <Link href={`/repos/${repoName}/pulls`} className="text-accent hover:underline">
                {t('pullsLink')}
              </Link>
              <Link href={`/repos/${repoName}/pr-stats`} className="text-accent hover:underline">
                {t('prStatsLink')}
              </Link>
              <Link href={`/repos/${repoName}/pipelines`} className="text-accent hover:underline">
                {t('pipelinesLink')}
              </Link>
              <Link href={`/repos/${repoName}/environments`} className="text-accent hover:underline">
                {t('environmentsLink')}
              </Link>
              <Link href={`/repos/${repoName}/settings`} className="text-accent hover:underline">
                {t('settingsLink')}
              </Link>
              <Link href={`/repos/${repoName}/security`} className="text-accent hover:underline">
                {t('securityLink')}
              </Link>
            </div>
          </li>
        ))}
        {repos?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          createRepo.mutate({ name }, { onSuccess: () => setName('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="repo-name" className="sr-only">
          {t('nameLabel')}
        </label>
        <input
          id="repo-name"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
          pattern="[a-zA-Z0-9_-]+"
        />
        <button
          type="submit"
          disabled={createRepo.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
      {createRepo.data && (
        <p className="mt-2 text-xs text-text-secondary">{t('cloneUrl', { url: createRepo.data.cloneUrl })}</p>
      )}
    </div>
  );
}
