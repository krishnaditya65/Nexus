// Per-service base URLs — same one-env-var-per-service convention every
// other service (and apps/web's own service-urls.ts) already uses.
export const SERVICE_URLS = {
  auth: process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001',
  pm: process.env.PM_SERVICE_URL ?? 'http://localhost:4002',
  bi: process.env.BI_SERVICE_URL ?? 'http://localhost:4007',
} as const;
