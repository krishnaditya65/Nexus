// Geo-based access restriction (docs/FEATURES.md §11.1) — wraps
// services/auth's new GET/POST /tenants/geo-restrictions. See
// AuthService.login's docblock (and GeoIpService's) for how this is
// enforced and its disclosed stub-GeoIP-provider scope.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export function useGeoRestrictions() {
  return useQuery<{ countries: string[] }, ApiError>({
    queryKey: ['geoRestrictions'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/tenants/geo-restrictions'),
  });
}

export function useSetGeoRestrictions() {
  const qc = useQueryClient();
  return useMutation<{ geo_allowed_countries: string[] | null }, ApiError, { countries: string[] }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/tenants/geo-restrictions', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['geoRestrictions'] }),
  });
}
