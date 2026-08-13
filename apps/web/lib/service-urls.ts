// Per-service base URLs, one env var each — mirrors every backend
// service's own `process.env.*_SERVICE_URL ?? 'http://localhost:<port>'`
// pattern (see e.g. services/bi/src/forecasting/forecasting.service.ts) so
// local dev needs zero configuration and prod just sets these like every
// other service-to-service URL in the platform already does.
export const SERVICE_URLS = {
  auth: process.env.NEXT_PUBLIC_AUTH_SERVICE_URL ?? 'http://localhost:4001',
  identityFederation: process.env.NEXT_PUBLIC_IDENTITY_FEDERATION_SERVICE_URL ?? 'http://localhost:4009',
  pm: process.env.NEXT_PUBLIC_PM_SERVICE_URL ?? 'http://localhost:4002',
  bi: process.env.NEXT_PUBLIC_BI_SERVICE_URL ?? 'http://localhost:4007',
  cicd: process.env.NEXT_PUBLIC_CICD_SERVICE_URL ?? 'http://localhost:4005',
  gitHost: process.env.NEXT_PUBLIC_GIT_HOST_SERVICE_URL ?? 'http://localhost:4003',
  qa: process.env.NEXT_PUBLIC_QA_SERVICE_URL ?? 'http://localhost:4006',
  comms: process.env.NEXT_PUBLIC_COMMS_SERVICE_URL ?? 'http://localhost:4004',
  apiPlatform: process.env.NEXT_PUBLIC_API_PLATFORM_SERVICE_URL ?? 'http://localhost:4013',
  aiPlatform: process.env.NEXT_PUBLIC_AI_PLATFORM_SERVICE_URL ?? 'http://localhost:4008',
  artifacts: process.env.NEXT_PUBLIC_ARTIFACTS_SERVICE_URL ?? 'http://localhost:4017',
  billing: process.env.NEXT_PUBLIC_BILLING_SERVICE_URL ?? 'http://localhost:4012',
  compliance: process.env.NEXT_PUBLIC_COMPLIANCE_SERVICE_URL ?? 'http://localhost:4011',
  notifications: process.env.NEXT_PUBLIC_NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014',
  incidentManagement: process.env.NEXT_PUBLIC_INCIDENT_MANAGEMENT_SERVICE_URL ?? 'http://localhost:4015',
  dataWarehouseSync: process.env.NEXT_PUBLIC_DATA_WAREHOUSE_SYNC_SERVICE_URL ?? 'http://localhost:4016',
  onboarding: process.env.NEXT_PUBLIC_ONBOARDING_SERVICE_URL ?? 'http://localhost:4010',
  graphqlGateway: process.env.NEXT_PUBLIC_GRAPHQL_GATEWAY_SERVICE_URL ?? 'http://localhost:4018',
} as const;
