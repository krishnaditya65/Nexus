'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAssets, useCreateAsset, AssetType, AssetStatus } from '@/lib/hooks/use-assets';

const ASSET_TYPES: AssetType[] = ['hardware', 'software_license', 'server'];
const STATUSES: AssetStatus[] = ['in_stock', 'in_use', 'maintenance', 'retired'];

/** Asset Management / CMDB (docs/FEATURES.md §13.7) — this service's
 *  first frontend surface for the asset registry (onboarding already had
 *  a UI for provisioning workflows themselves; the persistent asset
 *  entity is new — see AssetsService's docblock). */
export default function AssetsPage() {
  const t = useTranslations('assets');
  const tCommon = useTranslations('common');
  const [statusFilter, setStatusFilter] = useState<AssetStatus | ''>('');
  const [typeFilter, setTypeFilter] = useState<AssetType | ''>('');
  const { data: assets, isLoading, error } = useAssets({
    status: statusFilter || undefined,
    assetType: typeFilter || undefined,
  });
  const createAsset = useCreateAsset();

  const [assetTag, setAssetTag] = useState('');
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState<AssetType>('hardware');

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <div className="mb-4 flex gap-2 text-sm">
        <select
          className="rounded border border-border bg-surface-raised px-2 py-1"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as AssetStatus | '')}
        >
          <option value="">{t('allStatuses')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`status_${s}`)}
            </option>
          ))}
        </select>
        <select
          className="rounded border border-border bg-surface-raised px-2 py-1"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as AssetType | '')}
        >
          <option value="">{t('allTypes')}</option>
          {ASSET_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {t(`type_${tp}`)}
            </option>
          ))}
        </select>
      </div>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {assets?.map((a) => (
          <li key={a.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <Link href={`/assets/${a.id}`} className="text-sm font-medium text-accent hover:underline">
                {a.asset_tag} — {a.name}
              </Link>
              <p className="text-xs text-text-secondary">
                {t(`type_${a.asset_type}`)} · {t(`status_${a.status}`)}
              </p>
            </div>
          </li>
        ))}
        {assets?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!assetTag.trim() || !name.trim()) return;
          createAsset.mutate(
            { assetTag: assetTag.trim(), name: name.trim(), assetType },
            { onSuccess: () => { setAssetTag(''); setName(''); } },
          );
        }}
      >
        <div className="flex gap-2">
          <input
            className="w-40 rounded border border-border bg-surface-raised px-3 py-2 text-sm"
            placeholder={t('assetTagPlaceholder')}
            value={assetTag}
            onChange={(e) => setAssetTag(e.target.value)}
          />
          <input
            className="flex-1 rounded border border-border bg-surface-raised px-3 py-2 text-sm"
            placeholder={t('namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <select
            className="rounded border border-border bg-surface-raised px-2 py-2 text-sm"
            value={assetType}
            onChange={(e) => setAssetType(e.target.value as AssetType)}
          >
            {ASSET_TYPES.map((tp) => (
              <option key={tp} value={tp}>
                {t(`type_${tp}`)}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={!assetTag.trim() || !name.trim() || createAsset.isPending}
          className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
