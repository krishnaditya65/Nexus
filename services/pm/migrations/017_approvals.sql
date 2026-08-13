-- Generic approval workflow (docs/FEATURES.md §12.4) — attachable to ANY
-- ticket, not just release/deploy (services/cicd already has an
-- approval-gate concept, but it's scoped to pipeline environments; this
-- is the ticket-level equivalent Jira/ClickUp both have as a first-class
-- primitive). A ticket can have multiple approval requests outstanding
-- (e.g. legal + finance sign-off on the same ticket) — each is its own
-- row, addressed to one specific approver.

create table if not exists ticket_approvals (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  ticket_id uuid not null references tickets(id) on delete cascade,
  requested_by_user_id uuid not null,
  approver_user_id uuid not null,
  status text not null default 'pending', -- 'pending' | 'approved' | 'rejected'
  request_comment text,
  decision_comment text,
  requested_at timestamptz not null default now(),
  decided_at timestamptz
);

alter table ticket_approvals enable row level security;
alter table ticket_approvals force row level security;
create policy tenant_isolation_ticket_approvals on ticket_approvals
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create index if not exists idx_ticket_approvals_ticket on ticket_approvals (ticket_id, requested_at desc);
create index if not exists idx_ticket_approvals_approver_pending on ticket_approvals (tenant_id, approver_user_id) where status = 'pending';

grant select, insert, update, delete on ticket_approvals to eos_app;
