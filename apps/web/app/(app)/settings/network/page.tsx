'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { SettingsNav } from '@/components/settings-nav';
import { useIpAllowlist, useAddIpAllowlistEntry, useRemoveIpAllowlistEntry } from '@/lib/hooks/use-ip-allowlist';
import { useGeoRestrictions, useSetGeoRestrictions } from '@/lib/hooks/use-geo-restrictions';

export default function NetworkSettingsPage() {
  const t = useTranslations('network');
  const tCommon = useTranslations('common');
  const { data: entries, isLoading, error } = useIpAllowlist();
  const addEntry = useAddIpAllowlistEntry();
  const removeEntry = useRemoveIpAllowlistEntry();

  const [cidr, setCidr] = useState('');
  const [description, setDescription] = useState('');

  const { data: geo } = useGeoRestrictions();
  const setGeo = useSetGeoRestrictions();
  const [countriesInput, setCountriesInput] = useState('');
  useEffect(() => {
    if (geo) setCountriesInput(geo.countries.join(', '));
  }, [geo]);

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {entries?.length === 0 && (
        <p className="mb-4 rounded border border-border bg-surface-raised p-3 text-sm text-text-secondary">
          {t('unrestrictedNotice')}
        </p>
      )}
      {(entries?.length ?? 0) > 0 && (
        <p className="mb-4 rounded border border-warn bg-warn/10 p-3 text-sm text-warn">{t('enforcedNotice')}</p>
      )}

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-6 divide-y divide-border rounded border border-border">
        {entries?.map((entry) => (
          <li key={entry.id} className="flex items-center justify-between px-4 py-3">
            <div>
              <code className="text-sm">{entry.cidr}</code>
              {entry.description && <p className="text-xs text-text-secondary">{entry.description}</p>}
            </div>
            <button
              onClick={() => removeEntry.mutate(entry.id)}
              disabled={removeEntry.isPending}
              className="rounded border border-border px-3 py-1 text-xs hover:bg-surface-raised disabled:opacity-50"
            >
              {t('remove')}
            </button>
          </li>
        ))}
        {entries?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addEntry.mutate({ cidr, description }, { onSuccess: () => { setCidr(''); setDescription(''); } });
        }}
        className="space-y-2 rounded border border-border p-4"
      >
        <h2 className="text-sm font-medium">{t('addHeading')}</h2>
        <label htmlFor="ip-cidr" className="sr-only">
          {t('cidrLabel')}
        </label>
        <input
          id="ip-cidr"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('cidrPlaceholder')}
          value={cidr}
          onChange={(e) => setCidr(e.target.value)}
          required
        />
        <label htmlFor="ip-description" className="sr-only">
          {t('descriptionLabel')}
        </label>
        <input
          id="ip-description"
          className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        {addEntry.isError && <p className="text-xs text-danger">{addEntry.error.message}</p>}
        <button
          type="submit"
          disabled={addEntry.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('add')}
        </button>
      </form>

      <h2 className="mb-1 mt-8 text-sm font-medium">{t('geoRestrictionsTitle')}</h2>
      <p className="mb-3 text-xs text-text-secondary">{t('geoRestrictionsSubtitle')}</p>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const countries = countriesInput
            .split(',')
            .map((c) => c.trim().toUpperCase())
            .filter(Boolean);
          setGeo.mutate({ countries });
        }}
      >
        <input
          className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('geoCountriesPlaceholder')}
          value={countriesInput}
          onChange={(e) => setCountriesInput(e.target.value)}
        />
        <button
          type="submit"
          disabled={setGeo.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {tCommon('save')}
        </button>
      </form>
    </div>
  );
}
