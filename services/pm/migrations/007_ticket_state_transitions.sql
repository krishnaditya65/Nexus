-- Ticket state transition history (docs/ROADMAP.md — closes the shared
-- approximation both services/bi's ForecastingService and
-- SprintBurndownService document: without this table, "when did a ticket
-- actually finish" could only be approximated as `updated_at` on a
-- ticket currently in a terminal state, which is wrong two ways — it
-- resets on ANY field edit (assignee, story points, title), not just a
-- state change, and a ticket that bounced out of Done and back in only
-- ever showed its LAST bounce, not when it first (or most recently)
-- actually completed. This table records every transition as its own
-- row, so "when did this ticket most recently enter its current state"
-- becomes an exact query instead of a proxy.
create table if not exists ticket_state_transitions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null references tickets(id) on delete cascade,
  from_state_id uuid references workflow_states(id),  -- null for the ticket's initial state at creation
  to_state_id uuid not null references workflow_states(id),
  transitioned_at timestamptz not null default now()
);

alter table ticket_state_transitions enable row level security;
alter table ticket_state_transitions force row level security;
create policy tenant_isolation_ticket_state_transitions on ticket_state_transitions
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_ticket_state_transitions_ticket on ticket_state_transitions (ticket_id, transitioned_at);
-- Powers "latest entry into to_state_id per ticket" lookups (the
-- forecasting/burndown completion-date query) without a full table scan.
create index if not exists idx_ticket_state_transitions_to_state on ticket_state_transitions (to_state_id, transitioned_at);
