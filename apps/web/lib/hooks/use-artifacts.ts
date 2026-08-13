// Wraps services/artifacts — a real npm-registry-protocol-compatible
// package feed. There's no publish form here: publishing a package is a
// `npm publish` from a real npm client, same as every real registry
// (npm/Artifactory/Azure Artifacts) — this UI is read-only, listing what
// has actually landed via that protocol.
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export interface ArtifactPackage {
  id: string;
  name: string;
  created_at: string;
  version_count: string;
  latest_version: string | null;
}

export function usePackages() {
  return useQuery<ArtifactPackage[], ApiError>({
    queryKey: ['artifact-packages'],
    queryFn: () => apiFetch(SERVICE_URLS.artifacts, '/packages'),
  });
}
