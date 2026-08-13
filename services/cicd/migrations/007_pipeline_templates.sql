-- Pipeline YAML template library (docs/FEATURES.md §11.4) — reusable
-- STARTER YAML for common stacks, picked when creating a brand-new
-- pipeline, distinct from Task groups (005_library.sql's task_groups),
-- which are reusable step SEQUENCES referenced from within an existing
-- pipeline's YAML via `taskGroup: <name>`. A template is a starting point
-- you copy-and-edit; a task group is a live reference resolved at run
-- time. Built-in stack starters (node/python/go/docker) are served as
-- static constants (see library.service.ts) rather than seeded rows —
-- seeding them here would mean every existing tenant needs a backfill
-- migration and every new tenant needs seeding logic somewhere; a
-- hardcoded list has neither problem and can't be tenant-edited into an
-- inconsistent state. This table is only for tenant-saved CUSTOM
-- templates (e.g. "save this pipeline's YAML as a reusable starter").
create table if not exists pipeline_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  description text not null default '',
  yaml_definition text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table pipeline_templates enable row level security;
alter table pipeline_templates force row level security;
drop policy if exists tenant_isolation_pipeline_templates on pipeline_templates;
create policy tenant_isolation_pipeline_templates on pipeline_templates
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
