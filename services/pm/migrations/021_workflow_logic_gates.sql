-- Workflow Conditions/Validators/Post Functions (docs/FEATURES.md §13.1) —
-- the real Jira construct §12.2's automation engine only partially covers.
-- The distinction that matters: automations are event-driven and
-- fire-and-forget AFTER a transition has already committed (see
-- automations.service.ts's docblock on why — avoiding this build's
-- diagnosed nested-withTenant transaction-visibility bug); these three are
-- bound directly to the transition itself and run SYNCHRONOUSLY as part of
-- deciding whether the transition is even allowed to happen, and what else
-- changes at the moment it does. Different job, different mechanism —
-- correctly not the same engine reused with a different trigger.
--
-- Stored as jsonb arrays on workflow_transitions rather than three new
-- tables: each condition/validator/post-function is small, uniformly
-- shaped ({type, ...params}), and validated against a fixed vocabulary at
-- the application layer (TicketsService's *_TYPES consts) the same way
-- services/auth's custom-role PERMISSIONS catalog validates its own jsonb
-- array — a real, bounded vocabulary, not an arbitrary-code escape hatch.
alter table workflow_transitions add column if not exists conditions jsonb not null default '[]';
alter table workflow_transitions add column if not exists validators jsonb not null default '[]';
alter table workflow_transitions add column if not exists post_functions jsonb not null default '[]';
