-- Geo-based access restriction + impossible-travel anomaly detection
-- (docs/FEATURES.md §11.1). `tenants.geo_allowed_countries` — null/empty
-- means unrestricted (same fail-open discipline as `tenant_ip_allowlist`
-- and this migration's sibling `mfa_required`). `users.last_login_country`/
-- `last_login_at` are the two data points impossible-travel comparison
-- needs — a login from a different country implausibly soon after the
-- last one.
alter table tenants add column if not exists geo_allowed_countries text[];
alter table users add column if not exists last_login_country text;
alter table users add column if not exists last_login_at timestamptz;
