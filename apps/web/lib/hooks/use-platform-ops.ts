// §11.10 "cost/usage observability for the platform operator" — polls
// every service's own /health endpoint (deliberately unauthenticated, see
// each health.controller.ts's docblock) concurrently and reports real
// uptime + real process memory (process.memoryUsage().rss for Node
// services, runtime.MemStats.Sys for git-host's Go process). This is NOT
// tenant-facing billing (services/billing owns that) — it's "how much is
// running all 17 services actually costing us," the platform operator's
// own view, same reason health checks stay unauthenticated: there's no
// tenant session to scope this to in the first place.
import { useQuery } from '@tanstack/react-query';
import { SERVICE_URLS } from '../service-urls';

export interface ServiceHealthSnapshot {
  name: string;
  status: 'ok' | 'degraded' | 'unreachable';
  dbConnected?: boolean;
  uptimeSeconds?: number;
  memoryUsageMb?: number;
  error?: string;
}

const SERVICES: Array<{ key: keyof typeof SERVICE_URLS; label: string }> = [
  { key: 'auth', label: 'auth' },
  { key: 'pm', label: 'pm' },
  { key: 'gitHost', label: 'git-host' },
  { key: 'comms', label: 'comms' },
  { key: 'cicd', label: 'cicd' },
  { key: 'qa', label: 'qa' },
  { key: 'bi', label: 'bi' },
  { key: 'aiPlatform', label: 'ai-platform' },
  { key: 'apiPlatform', label: 'api-platform' },
  { key: 'artifacts', label: 'artifacts' },
  { key: 'billing', label: 'billing' },
  { key: 'compliance', label: 'compliance' },
  { key: 'notifications', label: 'notifications' },
  { key: 'identityFederation', label: 'identity-federation' },
  { key: 'incidentManagement', label: 'incident-management' },
  { key: 'dataWarehouseSync', label: 'data-warehouse-sync' },
  { key: 'onboarding', label: 'onboarding' },
];

async function fetchOne(label: string, baseUrl: string): Promise<ServiceHealthSnapshot> {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { name: label, status: 'degraded', ...body };
    }
    return { name: label, status: 'ok', ...body };
  } catch (err) {
    return { name: label, status: 'unreachable', error: err instanceof Error ? err.message : String(err) };
  }
}

export function usePlatformHealth() {
  return useQuery<ServiceHealthSnapshot[]>({
    queryKey: ['platformHealth'],
    queryFn: () => Promise.all(SERVICES.map((s) => fetchOne(s.label, SERVICE_URLS[s.key]))),
    refetchInterval: 15000,
  });
}
