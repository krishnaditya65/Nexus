-- Multi-view engine (docs/FEATURES.md §12.1) — ClickUp's signature
-- feature: the same underlying ticket data rendered as List, Calendar,
-- Table, or Workload, not three separate data models. Deliberately NOT a
-- new "saved_views" table with its own query logic: a "view" is just a
-- saved_queries row (filters) plus a viewType/groupBy hint for the
-- FRONTEND to render with — no new backend query logic needed at all,
-- confirming the FEATURES.md prediction that one view engine could power
-- all of these without new backend data.

alter table saved_queries add column if not exists view_type text not null default 'list';
alter table saved_queries add column if not exists group_by text;

-- Calendar view needs a real due-date field on tickets, which never
-- existed anywhere in this schema until now (checked — no due_date, no
-- target_date, nothing date-related besides created_at/updated_at).
alter table tickets add column if not exists due_date date;
