# comms (Phase 1)

Persistent chat channels, ticket micro-chats, and realtime message delivery
— the "Teams/Slack alternative" domain from the original spec.

## What's real

- `POST /channels`, `GET /channels` — standing channel CRUD + membership.
- `POST /channels/for-ticket/:ticketId` — idempotent get-or-create for a
  ticket's own micro-chat (the "every ticket is its own chat room" feature).
- `POST /channels/:id/messages`, `GET /channels/:id/messages` — durable
  message history in Postgres, membership-checked.
- WebSocket gateway (Socket.IO, JWT-authenticated on connect) subscribed to
  Redis Pub/Sub for realtime fanout — `join`/`leave` events scope delivery
  to Socket.IO rooms per `tenant:channel`.

## What's not (⚪, tracked in docs/FEATURES.md / docs/ROADMAP.md)

- WebRTC video/audio (LiveKit) + recording.
- Calendar/presence/scheduling, "in a meeting" auto-status.
- Cross-tenant shared channels.
- Global search across chat history (waits on services/ai-platform's
  semantic search index).
