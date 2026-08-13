-- comms service — persistent chat channels + messages, the "Teams/Slack
-- alternative" from the original spec. Redis Pub/Sub carries realtime
-- fanout (see chat.gateway.ts); Postgres is the durable history.

create extension if not exists "pgcrypto";

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  name text not null,
  is_private boolean not null default false,
  -- Non-null when this channel is a ticket's own micro-chat, per the
  -- original spec's "every ticket acts as its own chat room" — the FK
  -- target lives in services/pm's database, so it's a plain uuid here, not
  -- an enforced foreign key (cross-service references never are, in this
  -- platform's convention).
  ticket_id uuid,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

alter table channels enable row level security;
alter table channels force row level security;
create policy tenant_isolation_channels on channels
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_channels_ticket on channels (ticket_id) where ticket_id is not null;

create table if not exists channel_members (
  channel_id uuid not null references channels(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

alter table channel_members enable row level security;
alter table channel_members force row level security;
create policy tenant_isolation_channel_members on channel_members
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  channel_id uuid not null references channels(id) on delete cascade,
  author_user_id uuid not null,
  body text not null,
  -- Threading: a reply references its parent; top-level messages are null.
  parent_message_id uuid references messages(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table messages enable row level security;
alter table messages force row level security;
create policy tenant_isolation_messages on messages
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_messages_channel_created on messages (channel_id, created_at desc);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
