-- Bootstrap script, runs once against a fresh Postgres volume
-- (docker-entrypoint-initdb.d convention).
--
-- Two-role model per cluster:
--   eos       — the POSTGRES_USER, a superuser. Owns every table, runs
--               migrations. Superusers always bypass RLS, which is exactly
--               why application code must NEVER connect as this role.
--   eos_app   — plain login role, NOT superuser, NOT a table owner.
--               This is what every service's runtime pool connects as, so
--               `FORCE ROW LEVEL SECURITY` (set per-table in each service's
--               migrations) actually has teeth.
--
-- One Postgres DATABASE per microservice (not one shared "eos" database) so
-- schemas, migrations, and default-privilege grants stay independent as the
-- service count grows — a table-name collision in one domain can't break
-- another's migration.

create role eos_app with login password 'eos_app_dev_password';

create database eos_auth        owner eos;
create database eos_pm          owner eos;
create database eos_identity    owner eos;
create database eos_compliance  owner eos;
create database eos_billing     owner eos;
create database eos_apiplatform owner eos;
create database eos_notifications owner eos;
create database eos_incidents   owner eos;
create database eos_warehouse   owner eos;
create database eos_onboarding  owner eos;
create database eos_git         owner eos; -- services/git-host (Go) — PR/branch-protection metadata
create database eos_cicd        owner eos;
create database eos_qa          owner eos;
create database eos_bi          owner eos;
create database eos_aiplatform  owner eos;
create database eos_comms       owner eos; -- services/comms — chat channels, messages (added Phase 1; was missing here until Track 0 live-infra verification caught it — see docs/ROADMAP.md)
create database eos_artifacts   owner eos; -- services/artifacts — npm-compatible package registry (Phase 15)

grant connect on database eos_auth        to eos_app;
grant connect on database eos_pm          to eos_app;
grant connect on database eos_identity    to eos_app;
grant connect on database eos_compliance  to eos_app;
grant connect on database eos_billing     to eos_app;
grant connect on database eos_apiplatform to eos_app;
grant connect on database eos_notifications to eos_app;
grant connect on database eos_incidents   to eos_app;
grant connect on database eos_warehouse   to eos_app;
grant connect on database eos_onboarding  to eos_app;
grant connect on database eos_git         to eos_app;
grant connect on database eos_cicd        to eos_app;
grant connect on database eos_qa          to eos_app;
grant connect on database eos_bi          to eos_app;
grant connect on database eos_aiplatform  to eos_app;
grant connect on database eos_comms       to eos_app;
grant connect on database eos_artifacts   to eos_app;
