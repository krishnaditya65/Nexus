'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAsset, useUpdateAsset, AssetStatus } from '@/lib/hooks/use-assets';

const STATUSES: AssetStatus[] = ['in_stock', 'in_use', 'maintenance', 'retired'];

export default function AssetDetailPage({ params }: { params: { assetId: string } }) {
  const t = useTranslations('assets');
  const tCommon = useTranslations('common');
  const { data: asset, isLoading, error } = useAsset(params.assetId);
  const update = useUpdateAsset(params.assetId);

  return (
    <div className="mx-auto max-w-2xl">
      <Link href="/assets" className="mb-4 inline-block text-sm text-accent hover:underline">
        {t('backLink')}
      </Link>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {asset && (
        <>
          <div className="mb-1 flex items-center justify-between">
            <h1 className="text-xl font-semibold">
              {asset.asset_tag} — {asset.name}
            </h1>
            <select
              className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
              value={asset.status}
              onChange={(e) => update.mutate({ status: e.target.value as AssetStatus })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {t(`status_${s}`)}
                </option>
              ))}
            </select>
          </div>
          <p className="mb-6 text-sm text-text-secondary">{t(`type_${asset.asset_type}`)}</p>

          <dl className="mb-6 grid grid-cols-2 gap-3 text-sm">
            {asset.serial_number && (
              <div>
                <dt className="text-text-secondary">{t('serialNumberLabel')}</dt>
                <dd>{asset.serial_number}</dd>
              </div>
            )}
            {asset.warranty_expires && (
              <div>
                <dt className="text-text-secondary">{t('warrantyLabel')}</dt>
                <dd>{asset.warranty_expires}</dd>
              </div>
            )}
            {asset.assigned_to_user_id && (
              <div>
                <dt className="text-text-secondary">{t('assignedToLabel')}</dt>
                <dd>{asset.assigned_to_user_id}</dd>
              </div>
            )}
          </dl>

          <h2 className="mb-2 text-sm font-medium">{t('linkedTicketsHeading')}</h2>
          <ul className="divide-y divide-border rounded border border-border">
            {asset.linkedTickets.map((l) => (
              <li key={l.id} className="px-3 py-2 text-sm">
                {l.ticket_key}
              </li>
            ))}
            {asset.linkedTickets.length === 0 && (
              <li className="px-3 py-2 text-xs text-text-secondary">{t('noLinkedTickets')}</li>
            )}
          </ul>
        </>
      )}
    </div>
  );
}
