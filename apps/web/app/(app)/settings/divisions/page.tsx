'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { SettingsNav } from '@/components/settings-nav';
import { useAuthStore } from '@/lib/auth-store';
import { useSubTenants, useCreateSubTenant, useAccessSubTenant } from '@/lib/hooks/use-sub-tenants';

/** Sub-tenant isolation (docs/FEATURES.md §11.1) — a master tenant's owner
 *  manages its divisions here. Each division is a fully isolated ordinary
 *  tenant (RLS gives real data isolation for free — see the migration's
 *  docblock); this page's "Access" button mints a governed, audited
 *  cross-division token and switches the browser session into it, same as
 *  a normal login would. */
export default function DivisionsSettingsPage() {
  const t = useTranslations('divisions');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);

  const { data: subTenants, isLoading, error } = useSubTenants();
  const createSubTenant = useCreateSubTenant();
  const accessSubTenant = useAccessSubTenant();

  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <form
        className="mb-6 flex items-end gap-2 rounded border border-border p-3"
        onSubmit={(e) => {
          e.preventDefault();
          createSubTenant.mutate({ name, slug }, { onSuccess: () => { setName(''); setSlug(''); } });
        }}
      >
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('nameLabel')}</label>
          <input
            className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </div>
        <div className="flex-1">
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('slugLabel')}</label>
          <input
            className="w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={slug}
            onChange={(e) => setSlug(e.target.value)}
            required
          />
        </div>
        <button
          type="submit"
          disabled={createSubTenant.isPending}
          className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('createButton')}
        </button>
      </form>
      {createSubTenant.isError && <p className="mb-3 text-xs text-danger">{createSubTenant.error.message}</p>}

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {subTenants?.length === 0 && <li className="px-4 py-3 text-sm text-text-secondary">{t('empty')}</li>}
        {subTenants?.map((st) => (
          <li key={st.id} className="flex items-center justify-between px-4 py-3 text-sm">
            <div>
              <p>{st.name}</p>
              <p className="text-xs text-text-secondary">{st.slug}</p>
            </div>
            <button
              disabled={accessSubTenant.isPending}
              className="rounded border border-border px-2 py-1 text-xs hover:border-accent hover:text-accent disabled:opacity-50"
              onClick={() =>
                accessSubTenant.mutate(st.id, {
                  onSuccess: (result) => {
                    setSession(result.accessToken, result.tenantSlug);
                    router.push('/');
                  },
                })
              }
            >
              {t('accessButton')}
            </button>
          </li>
        ))}
      </ul>
      {accessSubTenant.isError && <p className="mt-3 text-xs text-danger">{accessSubTenant.error.message}</p>}
    </div>
  );
}
