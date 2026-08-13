-- Canary / blue-green rollout strategies (docs/FEATURES.md §4/§10) — an
-- extension of the existing deployments promotion-gate layer, same scope
-- note as before: this models WHICH FRACTION of traffic a deployment is
-- entitled to and the staged approval process to get there; it does not
-- itself perform traffic-shifting at a load balancer, same as the base
-- deployments feature never itself pushed bytes to a server (the
-- pipeline run's own `docker run` steps do that — a real canary/blue-
-- green integration's traffic-shift step is expected to be one of those
-- steps, reading `traffic_percentage` below).
alter table deployments add column if not exists strategy text not null default 'direct';
alter table deployments add column if not exists canary_stages jsonb;  -- e.g. [10, 50, 100], only for strategy='canary'
alter table deployments add column if not exists current_stage_index int not null default 0;
alter table deployments add column if not exists rollback_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deployments_strategy_check'
  ) then
    alter table deployments add constraint deployments_strategy_check
      check (strategy in ('direct', 'canary', 'blue_green'));
  end if;
end $$;

-- 'rolling_out' (canary, mid-stage) and 'verifying' (blue-green, deployed
-- to the idle slot but not yet cut over) and 'rolled_back' extend the
-- existing status enum, which was declared as plain `text` (see
-- 002_environments.sql), so no type migration is needed here — just
-- documenting the fuller state space in prose since Postgres has no
-- named-enum constraint on this column to update.
