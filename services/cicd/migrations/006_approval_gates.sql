-- Manual approval gates WITHIN a pipeline run (docs/FEATURES.md §11.4) —
-- distinct from the deployment/environment-layer approval gates §4 already
-- has (environments.service's freeze windows + deployment approval). This
-- is an in-pipeline pause: a YAML step with `approval: true` halts the run
-- entirely (not just one deployment) until a human calls the approve/reject
-- endpoint below, the same "the runner blocks on a real external signal"
-- shape used nowhere else in this service — runner.service.ts's execute()
-- previously ran start-to-finish with no pause point at all.
alter table pipeline_run_steps add column if not exists is_approval_gate boolean not null default false;
alter table pipeline_run_steps add column if not exists approved_by_user_id uuid;
alter table pipeline_run_steps add column if not exists approved_at timestamptz;
-- pipeline_runs.status already free-text ('queued'|'running'|'succeeded'|
-- 'failed') with no CHECK constraint — 'waiting_approval' just becomes a
-- new value in that same convention, no schema change needed for it.
