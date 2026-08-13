-- cicd service — feature flags. Phase 5 item 2 of docs/ROADMAP.md:
-- toggle a feature in production without a redeploy, targetable per
-- environment (services/cicd/src/environments), with percentage-based
-- rollout for A/B cohort assignment.

create table if not exists feature_flags (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  key text not null, -- stable machine identifier, e.g. "new-checkout-flow"
  name text not null,
  description text not null default '',
  -- The flag's default when no environment-specific target exists below —
  -- the simple case ("just on" / "just off" everywhere) doesn't need a
  -- target row at all.
  default_enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, key)
);

alter table feature_flags enable row level security;
alter table feature_flags force row level security;
create policy tenant_isolation_feature_flags on feature_flags
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Per-environment override, e.g. "on in Staging, off in Prod until the
-- rollout is ready." rollout_percentage supports the A/B cohort case: when
-- set (0-100), a caller is bucketed deterministically (see
-- FeatureFlagsService.evaluate's hashing) rather than a coin flip on every
-- request, so the same user consistently lands in the same cohort.
create table if not exists feature_flag_targets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  flag_id uuid not null references feature_flags(id) on delete cascade,
  environment_id uuid not null references environments(id) on delete cascade,
  is_enabled boolean not null default true,
  rollout_percentage int, -- null = not a percentage rollout, is_enabled applies to 100% of callers
  unique (flag_id, environment_id),
  check (rollout_percentage is null or (rollout_percentage >= 0 and rollout_percentage <= 100))
);

alter table feature_flag_targets enable row level security;
alter table feature_flag_targets force row level security;
create policy tenant_isolation_feature_flag_targets on feature_flag_targets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
