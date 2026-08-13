'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDashboards, useCreateDashboard } from '@/lib/hooks/use-dashboards';

export default function DashboardsListPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('dashboards');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;
  const { data: dashboards, isLoading, error } = useDashboards(projectId);
  const createDashboard = useCreateDashboard(projectId);
  const [name, setName] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {dashboards?.map((d) => (
          <li key={d.id} className="px-4 py-3">
            <Link href={`/projects/${projectId}/dashboards/${d.id}`} className="text-accent hover:underline">
              {d.name}
            </Link>
          </li>
        ))}
        {dashboards?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          createDashboard.mutate({ name }, { onSuccess: () => setName('') });
        }}
        className="flex gap-2"
      >
        <label htmlFor="dashboard-name" className="sr-only">
          {t('nameLabel')}
        </label>
        <input
          id="dashboard-name"
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={createDashboard.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('newDashboard')}
        </button>
      </form>
    </div>
  );
}
