-- Dashboards (docs/FEATURES.md §7/§10) — widget-based, configurable,
-- same shape as ADO's own Dashboards hub. A dashboard is just a named
-- layout of widgets; each widget names a data source (widget_type) and a
-- small config blob (e.g. which sprint/repo to pull from) — the widget
-- itself holds NO denormalized data, matching this platform's existing
-- pattern (docs/ARCHITECTURE.md) of `apps/web` calling each owning
-- service directly rather than a data-aggregation gateway. Rendering a
-- widget means the frontend calls the same endpoint a dedicated screen
-- for that data already calls.
create table if not exists dashboards (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  name text not null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table dashboards enable row level security;
alter table dashboards force row level security;
create policy tenant_isolation_dashboards on dashboards
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_dashboards_project on dashboards (project_id);

-- widget_type is a hardcoded whitelist (same "reject, don't silently
-- coerce" pattern as queries' field whitelist and retrospectives'
-- category whitelist) — each type maps to exactly one existing
-- cross-service endpoint the frontend already knows how to call.
create table if not exists dashboard_widgets (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  dashboard_id uuid not null references dashboards(id) on delete cascade,
  widget_type text not null,
  title text not null,
  position int not null default 0,
  config jsonb not null default '{}',
  created_at timestamptz not null default now(),
  constraint dashboard_widgets_type_check check (
    widget_type in (
      'ticket_counts_by_state',
      'sprint_burndown',
      'open_pull_requests',
      'flaky_tests',
      'team_capacity'
    )
  )
);

alter table dashboard_widgets enable row level security;
alter table dashboard_widgets force row level security;
create policy tenant_isolation_dashboard_widgets on dashboard_widgets
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_dashboard_widgets_dashboard on dashboard_widgets (dashboard_id, position);
