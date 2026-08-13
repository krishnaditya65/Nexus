# bi (Phase 1)

Time tracking/timesheets and Monte Carlo delivery forecasting. Budget
estimation, CapEx/OpEx, and invoicing now live in `services/billing` — see
that service's README for the financial half of what "BI, Budgets &
Financials" originally described.

## What's real

- `POST /time-entries`, `GET /time-entries` — per-user time logging against
  an optional `services/pm` ticket; auto-creates a draft weekly timesheet.
- `POST /timesheets/:weekStartDate/submit`, `GET /timesheets/pending-approval`,
  `POST /timesheets/:id/approve`, `POST /timesheets/:id/reject` — the
  submission/approval workflow.
- `GET /forecast?projectId=...` — real Monte Carlo simulation (10,000 runs):
  fetches live ticket state from `services/pm`, derives historical weekly
  throughput, and reports p50/p85/p95 completion-date confidence — "85%
  chance this Epic finishes by \<date>" from the original spec, computed,
  not hardcoded.

## What's not (⚪)

- OKRs linked to Epics.
- Dashboard builder + scheduled PDF/CSV report exports.
- A `ticket_state_transitions` history table in `services/pm` — forecasting
  currently proxies "completed" from a ticket's `updated_at` while in a
  terminal state, which undercounts tickets that bounced between states
  multiple times. Documented in `forecasting.service.ts`.
