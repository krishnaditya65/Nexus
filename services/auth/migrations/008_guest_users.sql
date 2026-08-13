-- Guest users (docs/FEATURES.md §12.7) — a tenant member who exists so
-- one specific project can be shared with them, not the whole tenant.
-- Deliberately NOT a new role tier alongside owner/admin/member (that's
-- the still-pending, genuinely large "custom role builder" from §11.1) —
-- a guest is a 'member' with is_guest = true, and services/pm's new
-- project_members table is what actually restricts which project(s) a
-- guest can see (see services/pm/migrations/020_project_members.sql).
-- This column's only job is to travel in the JWT so pm knows to check
-- membership at all — a non-guest member is never membership-checked.

alter table users add column if not exists is_guest boolean not null default false;
