-- Adds 'velocity_trend' to dashboard_widgets' widget_type whitelist —
-- the first step toward a general-purpose analytics-view builder
-- (docs/FEATURES.md §10 "Analytics views"), and closes §2's "Velocity
-- chart" gap (previously ⚪, flagged as trivial once real sprints exist).
-- Story points completed per completed sprint, served by
-- SprintsService.getVelocityTrend / GET /sprints/velocity.

alter table dashboard_widgets drop constraint dashboard_widgets_type_check;

alter table dashboard_widgets add constraint dashboard_widgets_type_check check (
  widget_type in (
    'ticket_counts_by_state',
    'sprint_burndown',
    'open_pull_requests',
    'flaky_tests',
    'team_capacity',
    'velocity_trend'
  )
);
