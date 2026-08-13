// The pre-auth subdomain lookup pair from docs/ARCHITECTURE.md's
// "Subdomain-based tenant routing" section: does this workspace exist
// (auth-service), and does it use SSO (identity-federation) — what the
// login page needs before rendering anything.
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

interface TenantResolution {
  slug: string;
  displayName: string;
}

interface SsoAvailability {
  ssoEnabled: boolean;
  providerLabel?: string;
}

export function useTenantResolution(subdomain: string | null) {
  return useQuery<TenantResolution, ApiError>({
    queryKey: ['tenant-resolution', subdomain],
    queryFn: () => apiFetch<TenantResolution>(SERVICE_URLS.auth, `/tenants/resolve/${subdomain}`),
    enabled: !!subdomain,
    retry: false,
  });
}

export function useSsoAvailability(tenantSlug: string | null) {
  return useQuery<SsoAvailability, ApiError>({
    queryKey: ['sso-availability', tenantSlug],
    queryFn: () => apiFetch<SsoAvailability>(SERVICE_URLS.identityFederation, `/sso/${tenantSlug}/available`),
    enabled: !!tenantSlug,
    retry: false,
  });
}
