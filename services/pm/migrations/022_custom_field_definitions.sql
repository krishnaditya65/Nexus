-- Typed custom fields + per-screen layouts (docs/FEATURES.md §13.1).
--
-- `tickets.custom_fields` (001_init.sql) has always been a free-form jsonb
-- blob — anything could be stuffed in under any key, with no type, no
-- validation, no admin-visible catalog of "what fields exist on this
-- project." That's the real Jira gap: Jira's custom fields are typed
-- (text/number/select/multiselect/date/user-picker/checkbox), scoped to
-- specific issue types, and arranged per-screen (create screen vs edit
-- screen vs view screen can show different fields).
--
-- This migration adds the DEFINITION layer on top of the existing jsonb
-- storage — it does NOT change tickets.custom_fields itself. A ticket's
-- values still live in that same jsonb column, keyed by
-- custom_field_definitions.id (as a string). That keeps every existing
-- read/write of custom_fields (workflow validators' field_required check,
-- automations, forms) working unmodified; this migration is purely
-- additive metadata that the application layer now validates against.
create table if not exists custom_field_definitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  key text not null,          -- stable identifier used as the jsonb key, e.g. "story_risk"
  label text not null,
  -- Fixed, validated vocabulary — same discipline as the custom role
  -- builder's PERMISSIONS catalog and the workflow logic gates' condition/
  -- validator/post-function types: a bounded TS union checked at the
  -- application layer, never an arbitrary type string.
  field_type text not null check (field_type in ('text', 'number', 'date', 'checkbox', 'select', 'multiselect', 'user_picker')),
  options jsonb not null default '[]',   -- for select/multiselect: string[] of allowed values
  -- Which issue types this field applies to. Empty array = all types.
  issue_types jsonb not null default '[]',
  is_required boolean not null default false,
  position int not null default 0,
  created_at timestamptz not null default now(),
  unique (project_id, key)
);

alter table custom_field_definitions enable row level security;
alter table custom_field_definitions force row level security;
create policy tenant_isolation_custom_field_definitions on custom_field_definitions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Per-screen layout: which fields (in what order) show up on the create
-- screen vs the edit/view screen, per issue type. A field can exist
-- (defined above) without being on every screen — e.g. a field set only by
-- a post-function might be hidden from the create screen entirely.
create table if not exists custom_field_screens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  issue_type text not null,               -- 'epic' | 'story' | 'bug' | 'task'
  screen text not null check (screen in ('create', 'edit')),
  field_id uuid not null references custom_field_definitions(id) on delete cascade,
  position int not null default 0,
  unique (project_id, issue_type, screen, field_id)
);

alter table custom_field_screens enable row level security;
alter table custom_field_screens force row level security;
create policy tenant_isolation_custom_field_screens on custom_field_screens
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
