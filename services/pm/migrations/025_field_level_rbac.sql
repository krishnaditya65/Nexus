-- Field-level RBAC (docs/FEATURES.md §11.1) — restrict visibility of a
-- specific typed custom field (§13.1's custom_field_definitions, e.g. a
-- "Salary" or "Legal notes" field) by permission, on top of ordinary
-- project membership. Additive column, reused table — same pattern as
-- every other "layer a flag onto an existing table" gap this build has
-- closed (wiki_pages.is_public, etc). NULL (the default) means unrestricted
-- — every existing field stays visible to every project member exactly as
-- before; only a field an admin explicitly locks down changes behavior.
alter table custom_field_definitions add column if not exists restricted_to_permission text;
