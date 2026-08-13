'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SettingsNav } from '@/components/settings-nav';
import {
  useVendorSubscriptions,
  useVendorSpendSummary,
  useAddVendorSubscription,
  useRemoveVendorSubscription,
} from '@/lib/hooks/use-vendor-spend';

function centsToDisplay(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function VendorSpendPage() {
  const t = useTranslations('vendorSpend');
  const tCommon = useTranslations('common');
  const { data: vendors, isLoading, error } = useVendorSubscriptions();
  const { data: summary } = useVendorSpendSummary();
  const addVendor = useAddVendorSubscription();
  const removeVendor = useRemoveVendorSubscription();

  const [vendorName, setVendorName] = useState('');
  const [category, setCategory] = useState('');
  const [monthlyDollars, setMonthlyDollars] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {summary && (
        <div className="mb-6 rounded border border-border bg-surface-raised p-4">
          <p className="mb-2 text-lg font-semibold">{t('totalMonthly', { amount: centsToDisplay(summary.totalMonthlyCents) })}</p>
          <ul className="space-y-1">
            {summary.byCategory.map((c) => (
              <li key={c.category} className="flex items-center justify-between text-sm">
                <span className="text-text-secondary">
                  {c.category} ({c.vendor_count})
                </span>
                <span>{centsToDisplay(c.total_cents)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-6 divide-y divide-border rounded border border-border">
        {vendors?.map((v) => (
          <li key={v.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="font-medium">{v.vendor_name}</p>
              <p className="text-xs text-text-secondary">
                {v.category} · {centsToDisplay(v.monthly_cost_cents)}/mo
              </p>
            </div>
            <button
              onClick={() => removeVendor.mutate(v.id)}
              disabled={removeVendor.isPending}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
            >
              {t('remove')}
            </button>
          </li>
        ))}
        {vendors?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const cents = Math.round(Number(monthlyDollars) * 100);
          if (!vendorName.trim() || !Number.isFinite(cents) || cents <= 0) return;
          addVendor.mutate(
            { vendorName, category: category || undefined, monthlyCostCents: cents },
            { onSuccess: () => { setVendorName(''); setCategory(''); setMonthlyDollars(''); } },
          );
        }}
        className="space-y-2 rounded border border-border p-4"
      >
        <h2 className="text-sm font-medium">{t('addHeading')}</h2>
        <input
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('vendorNamePlaceholder')}
          value={vendorName}
          onChange={(e) => setVendorName(e.target.value)}
          required
        />
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('categoryPlaceholder')}
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <input
            type="number"
            step="0.01"
            className="w-40 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('monthlyCostPlaceholder')}
            value={monthlyDollars}
            onChange={(e) => setMonthlyDollars(e.target.value)}
            required
          />
        </div>
        {addVendor.isError && <p className="text-xs text-danger">{addVendor.error.message}</p>}
        <button
          type="submit"
          disabled={addVendor.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('add')}
        </button>
      </form>
    </div>
  );
}
