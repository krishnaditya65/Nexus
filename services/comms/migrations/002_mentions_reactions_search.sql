-- @mentions notification routing, emoji reactions, and full-text message
-- search (docs/FEATURES.md §11.6) — threaded replies already had a data
-- model (messages.parent_message_id existed since 001_init.sql, just
-- with no thread-fetch endpoint or UI consuming it; both added in this
-- pass's service/frontend code, no schema change needed for that part).

create table if not exists message_reactions (
  message_id uuid not null references messages(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid not null,
  emoji text not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id, emoji)
);

alter table message_reactions enable row level security;
alter table message_reactions force row level security;
drop policy if exists tenant_isolation_message_reactions on message_reactions;
create policy tenant_isolation_message_reactions on message_reactions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Full-text search: a generated tsvector column + GIN index, rather than
-- computing to_tsvector(body) at query time on every search — messages
-- are written far more rarely than a channel is searched, so paying the
-- indexing cost once at write time is the right trade.
alter table messages add column if not exists search_vector tsvector
  generated always as (to_tsvector('english', body)) stored;
create index if not exists idx_messages_search on messages using gin (search_vector);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
