// Wraps services/identity-federation's SSO connection admin endpoints
// (docs/FEATURES.md §11.1 — OIDC was already live; this adds SAML 2.0).
import { useMutation } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface SsoConnection {
  id: string;
  tenant_id: string;
  tenant_slug: string;
  protocol: 'oidc' | 'saml2';
  provider_label: string;
  is_enabled: boolean;
}

export function useUpsertOidcConnection() {
  return useMutation<
    SsoConnection,
    ApiError,
    { tenantSlug: string; providerLabel: string; issuerUrl: string; clientId: string; clientSecret: string }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.identityFederation, '/sso-connections/oidc', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function useUpsertSamlConnection() {
  return useMutation<
    SsoConnection,
    ApiError,
    { tenantSlug: string; providerLabel: string; idpMetadataXml: string; spEntityId?: string }
  >({
    mutationFn: (body) =>
      apiFetch(SERVICE_URLS.identityFederation, '/sso-connections/saml', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });
}

export function samlSpMetadataUrl(tenantSlug: string) {
  return `${SERVICE_URLS.identityFederation}/sso/saml/${tenantSlug}/metadata`;
}

export function samlSpAcsUrl(tenantSlug: string) {
  return `${SERVICE_URLS.identityFederation}/sso/saml/${tenantSlug}/acs`;
}

export function samlLoginUrl(tenantSlug: string) {
  return `${SERVICE_URLS.identityFederation}/sso/saml/${tenantSlug}/login`;
}
