-- WebRTC video/audio calls (docs/FEATURES.md §11.6) — the server's job in
-- WebRTC is signaling relay (exchange SDP offers/answers + ICE candidates
-- between peers so they can establish a DIRECT peer-to-peer media
-- connection) and call bookkeeping; the actual audio/video/screen-share
-- media never touches this service or its database — it flows browser-
-- to-browser once signaling completes. This is a MESH topology (every
-- participant connects directly to every other one), the right choice
-- for 1:1 and small-group calls without needing a media server (SFU) —
-- LiveKit/Mediasoup-class infrastructure is the right fast-follow if this
-- ever needs to support large group calls, deliberately not built here.
create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  -- A call is either tied to a chat channel (the common "call from a
  -- channel" case) or a ticket key directly (call-from-ticket paging,
  -- e.g. an Incident with no channel of its own yet) — at least one
  -- should be set, enforced at the application layer, not a DB
  -- constraint (both being null is a harmless orphan call, not a
  -- integrity violation worth hard-blocking on).
  channel_id uuid references channels(id) on delete set null,
  ticket_key text,
  started_by_user_id uuid not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table calls enable row level security;
alter table calls force row level security;
create policy tenant_isolation_calls on calls
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_calls_channel on calls (channel_id) where channel_id is not null;

create table if not exists call_participants (
  call_id uuid not null references calls(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  primary key (call_id, user_id, joined_at)
);

alter table call_participants enable row level security;
alter table call_participants force row level security;
create policy tenant_isolation_call_participants on call_participants
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Cloud call recording (docs/FEATURES.md §11.6) — client-side recording
-- (the browser's own MediaRecorder API, mixing local + remote streams),
-- uploaded here after the call ends. No server-side media pipeline needed
-- since there's no SFU to tap into (mesh topology, see this file's
-- docblock) — the same "record what you can already see/hear" approach
-- browsers' own built-in screen/tab recording uses.
create table if not exists call_recordings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  call_id uuid not null references calls(id) on delete cascade,
  storage_path text not null,   -- local-disk path this pass; see storage.ts's docblock for the object-storage swap-in note
  uploaded_by_user_id uuid not null,
  duration_seconds int,
  uploaded_at timestamptz not null default now()
);

alter table call_recordings enable row level security;
alter table call_recordings force row level security;
create policy tenant_isolation_call_recordings on call_recordings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
