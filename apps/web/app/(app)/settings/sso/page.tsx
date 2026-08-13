'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { SettingsNav } from '@/components/settings-nav';
import { useAuthStore } from '@/lib/auth-store';
import {
  useUpsertOidcConnection,
  useUpsertSamlConnection,
  samlSpMetadataUrl,
  samlSpAcsUrl,
} from '@/lib/hooks/use-sso-connections';

/** Tenant-admin SSO configuration — OIDC (Okta/Entra ID/Google Workspace
 *  authorization-code flow) and SAML 2.0 (SP-initiated, docs/FEATURES.md
 *  §11.1). Both write to services/identity-federation's sso_connections
 *  table; this page is the first UI for either — previously admin-only via
 *  direct API calls. */
export default function SsoSettingsPage() {
  const t = useTranslations('sso');
  const tCommon = useTranslations('common');
  const tenantSlug = useAuthStore((s) => s.tenantSlug) ?? '';

  const upsertOidc = useUpsertOidcConnection();
  const upsertSaml = useUpsertSamlConnection();

  const [oidcLabel, setOidcLabel] = useState('');
  const [oidcIssuer, setOidcIssuer] = useState('');
  const [oidcClientId, setOidcClientId] = useState('');
  const [oidcClientSecret, setOidcClientSecret] = useState('');

  const [samlLabel, setSamlLabel] = useState('');
  const [samlMetadataXml, setSamlMetadataXml] = useState('');

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <section className="mb-10">
        <h2 className="mb-1 text-lg font-semibold">{t('oidcHeading')}</h2>
        <p className="mb-3 text-xs text-text-secondary">{t('oidcExplainer')}</p>
        <form
          className="rounded border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            upsertOidc.mutate({
              tenantSlug,
              providerLabel: oidcLabel,
              issuerUrl: oidcIssuer,
              clientId: oidcClientId,
              clientSecret: oidcClientSecret,
            });
          }}
        >
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('providerLabelLabel')}</label>
          <input
            className="mb-2 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder="Okta"
            value={oidcLabel}
            onChange={(e) => setOidcLabel(e.target.value)}
            required
          />
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('issuerUrlLabel')}</label>
          <input
            className="mb-2 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder="https://your-org.okta.com"
            value={oidcIssuer}
            onChange={(e) => setOidcIssuer(e.target.value)}
            required
          />
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('clientIdLabel')}</label>
          <input
            className="mb-2 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={oidcClientId}
            onChange={(e) => setOidcClientId(e.target.value)}
            required
          />
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('clientSecretLabel')}</label>
          <input
            type="password"
            className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={oidcClientSecret}
            onChange={(e) => setOidcClientSecret(e.target.value)}
            required
          />
          {upsertOidc.isError && <p className="mb-3 text-xs text-danger">{upsertOidc.error.message}</p>}
          {upsertOidc.isSuccess && <p className="mb-3 text-xs text-success">{t('saved')}</p>}
          <button
            type="submit"
            disabled={upsertOidc.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {tCommon('save')}
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-1 text-lg font-semibold">{t('samlHeading')}</h2>
        <p className="mb-3 text-xs text-text-secondary">{t('samlExplainer')}</p>

        {tenantSlug && (
          <div className="mb-3 rounded border border-border bg-surface p-3 text-xs">
            <p className="mb-1 font-medium text-text-secondary">{t('spDetailsHeading')}</p>
            <p className="mb-1">
              {t('acsUrlLabel')}: <code className="break-all">{samlSpAcsUrl(tenantSlug)}</code>
            </p>
            <p>
              {t('spMetadataUrlLabel')}:{' '}
              <a
                className="break-all text-accent hover:underline"
                href={samlSpMetadataUrl(tenantSlug)}
                target="_blank"
                rel="noreferrer"
              >
                {samlSpMetadataUrl(tenantSlug)}
              </a>
            </p>
          </div>
        )}

        <form
          className="rounded border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            upsertSaml.mutate({ tenantSlug, providerLabel: samlLabel, idpMetadataXml: samlMetadataXml });
          }}
        >
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('providerLabelLabel')}</label>
          <input
            className="mb-2 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder="Entra ID"
            value={samlLabel}
            onChange={(e) => setSamlLabel(e.target.value)}
            required
          />
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('idpMetadataXmlLabel')}</label>
          <textarea
            className="mb-3 h-40 w-full rounded border border-border bg-surface-raised px-2 py-1.5 font-mono text-xs"
            placeholder="<EntityDescriptor ...>...</EntityDescriptor>"
            value={samlMetadataXml}
            onChange={(e) => setSamlMetadataXml(e.target.value)}
            required
          />
          {upsertSaml.isError && <p className="mb-3 text-xs text-danger">{upsertSaml.error.message}</p>}
          {upsertSaml.isSuccess && <p className="mb-3 text-xs text-success">{t('saved')}</p>}
          <button
            type="submit"
            disabled={upsertSaml.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {tCommon('save')}
          </button>
        </form>
      </section>
    </div>
  );
}
