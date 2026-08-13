'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useProblems, useCreateProblem, ProblemStatus } from '@/lib/hooks/use-problems';

const STATUSES: ProblemStatus[] = ['new', 'investigating', 'known_error', 'resolved', 'closed'];

/** Problem Management (docs/FEATURES.md §13.7) — this service's first
 *  frontend page (services/incident-management had none before this).
 *  ITIL-style root-cause tracking, deliberately a separate workflow from
 *  Incident response — see ProblemsService's docblock. */
export default function ProblemsPage() {
  const t = useTranslations('problems');
  const tCommon = useTranslations('common');
  const [statusFilter, setStatusFilter] = useState<ProblemStatus | ''>('');
  const { data: problems, isLoading, error } = useProblems(statusFilter || undefined);
  const createProblem = useCreateProblem();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <div className="mb-4 flex items-center gap-2 text-sm">
        <span className="text-text-secondary">{t('filterLabel')}</span>
        <select
          className="rounded border border-border bg-surface-raised px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as ProblemStatus | '')}
        >
          <option value="">{t('filterAll')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}`)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {problems?.map((p) => (
          <li key={p.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link href={`/problems/${p.id}`} className="text-sm font-medium text-accent hover:underline">
                {p.title}
              </Link>
              <p className="text-xs text-text-secondary">{t(`status_${p.status}`)}</p>
            </div>
          </li>
        ))}
        {problems?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = title.trim();
          if (!trimmed) return;
          createProblem.mutate({ title: trimmed, description }, { onSuccess: () => { setTitle(''); setDescription(''); } });
        }}
      >
        <label htmlFor="problem-title" className="sr-only">
          {t('titleLabel')}
        </label>
        <input
          id="problem-title"
          className="rounded border border-border bg-surface-raised px-3 py-2 text-sm"
          placeholder={t('titlePlaceholder')}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="rounded border border-border bg-surface-raised px-3 py-2 text-sm"
          rows={3}
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="submit"
          disabled={!title.trim() || createProblem.isPending}
          className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
