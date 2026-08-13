'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useDeliveryPlans, useCreateDeliveryPlan, useDeleteDeliveryPlan } from '@/lib/hooks/use-delivery-plans';
import { useProjects } from '@/lib/hooks/use-projects';

export default function DeliveryPlansPage() {
  const t = useTranslations('deliveryPlans');
  const tCommon = useTranslations('common');
  const { data: plans, isLoading, error } = useDeliveryPlans();
  const { data: projects } = useProjects();
  const createPlan = useCreateDeliveryPlan();
  const deletePlan = useDeleteDeliveryPlan();

  const [name, setName] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {plans?.map((plan) => (
          <li key={plan.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">{plan.name}</p>
              <p className="text-xs text-text-secondary">{plan.project_ids.length} projects</p>
            </div>
            <div className="flex gap-3">
              <Link href={`/delivery-plans/${plan.id}`} className="text-sm text-accent hover:underline">
                {t('openLink')}
              </Link>
              <button className="text-sm text-danger hover:underline" onClick={() => deletePlan.mutate(plan.id)}>
                {t('delete')}
              </button>
            </div>
          </li>
        ))}
        {plans?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed || selectedProjectIds.length === 0) return;
          createPlan.mutate(
            { name: trimmed, projectIds: selectedProjectIds },
            { onSuccess: () => { setName(''); setSelectedProjectIds([]); } },
          );
        }}
      >
        <label htmlFor="plan-name" className="sr-only">
          {t('namePlaceholder')}
        </label>
        <input
          id="plan-name"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <p className="text-xs font-medium text-text-secondary">{t('projectsLabel')}</p>
        <div className="flex flex-wrap gap-3">
          {projects?.map((p) => (
            <label key={p.id} className="flex items-center gap-1 text-xs">
              <input
                type="checkbox"
                checked={selectedProjectIds.includes(p.id)}
                onChange={(e) =>
                  setSelectedProjectIds((prev) => (e.target.checked ? [...prev, p.id] : prev.filter((x) => x !== p.id)))
                }
              />
              {p.key} — {p.name}
            </label>
          ))}
        </div>
        <button
          type="submit"
          disabled={createPlan.isPending}
          className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
