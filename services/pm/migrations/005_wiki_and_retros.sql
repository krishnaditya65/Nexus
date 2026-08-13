-- Wiki (docs/FEATURES.md §2/§10) — plain markdown text storage, no
-- real-time multi-cursor (Yjs) yet, that's the ambitious version tracked
-- separately. `parent_page_id` supports a page tree even though the first
-- UI cut renders a flat list — the column existing now means a future
-- nested-nav UI is a query change, not a migration.
create table if not exists wiki_pages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  parent_page_id uuid references wiki_pages(id) on delete set null,
  title text not null,
  content text not null default '',
  created_by_user_id uuid not null,
  updated_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table wiki_pages enable row level security;
alter table wiki_pages force row level security;
create policy tenant_isolation_wiki_pages on wiki_pages
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_wiki_pages_project on wiki_pages (project_id);

-- Retrospectives (docs/FEATURES.md §2/§10) — one retro per (usually)
-- completed sprint, three-column item board (went well / went poorly /
-- action item), same shape Jira/ADO's retro tooling uses. No anonymous-
-- voting or facilitator-timer features yet — those are polish on top of
-- this core shape, not blockers to it existing at all.
create table if not exists retrospectives (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  project_id uuid not null references projects(id) on delete cascade,
  sprint_id uuid references sprints(id) on delete set null,
  title text not null,
  status text not null default 'open',  -- 'open' | 'closed'
  created_by_user_id uuid not null,
  created_at timestamptz not null default now()
);

alter table retrospectives enable row level security;
alter table retrospectives force row level security;
create policy tenant_isolation_retrospectives on retrospectives
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_retrospectives_project on retrospectives (project_id);

create table if not exists retrospective_items (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  retrospective_id uuid not null references retrospectives(id) on delete cascade,
  category text not null,  -- 'went_well' | 'went_poorly' | 'action_item'
  content text not null,
  author_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint retrospective_items_category_check
    check (category in ('went_well', 'went_poorly', 'action_item'))
);

alter table retrospective_items enable row level security;
alter table retrospective_items force row level security;
create policy tenant_isolation_retrospective_items on retrospective_items
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_retrospective_items_retro on retrospective_items (retrospective_id);
