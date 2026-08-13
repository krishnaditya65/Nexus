'use client';

import { useTranslations } from 'next-intl';
import { usePackages } from '@/lib/hooks/use-artifacts';

export default function ArtifactsPage() {
  const t = useTranslations('artifacts');
  const tCommon = useTranslations('common');
  const { data: packages, isLoading, error } = usePackages();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {packages?.map((pkg) => (
          <li key={pkg.id} className="flex items-center justify-between px-4 py-3">
            <span className="font-mono text-sm">{pkg.name}</span>
            <span className="text-xs text-text-secondary">
              {t('versionCount', { count: Number(pkg.version_count) })}
              {pkg.latest_version && ` · ${t('latestLabel')}: ${pkg.latest_version}`}
            </span>
          </li>
        ))}
        {packages?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
