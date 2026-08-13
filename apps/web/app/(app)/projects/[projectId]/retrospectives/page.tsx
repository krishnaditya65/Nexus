'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useRetrospectives, useCreateRetrospective } from '@/lib/hooks/use-retrospectives';

export default function RetrospectivesListPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('retrospectives');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;
  const { data: retros, isLoading, error } = useRetrospectives(projectId);
  const createRetro = useCreateRetrospective(projectId);
  const [title, setTitle] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {retros?.map((retro) => (
          <li key={retro.id} className="flex items-center justify-between px-4 py-3">
            <Link href={`/projects/${projectId}/retrospectives/${retro.id}`} className="text-accent hover:underline">
              {retro.title}
            </Link>
            <span
              className={`rounded px-2 py-0.5 text-xs ${
                retro.status === 'open' ? 'bg-accent/20 text-accent' : 'bg-surface-raised text-text-secondary'
              }`}
            >
              {retro.status === 'open' ? t('statusOpen') : t('statusClosed')}
            </span>
          </li>
        ))}
        {retros?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!title.trim()) return;
          createRetro.mutate({ title }, { onSuccess: () => setTitle('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="retro-title" className="sr-only">
          {t('titleLabel')}
        </label>
        <input
          id="retro-title"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <button
          type="submit"
          disabled={createRetro.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('newRetro')}
        </button>
      </form>
    </div>
  );
}
