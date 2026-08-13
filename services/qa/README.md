# qa (Phase 1)

Test plans/suites, Gherkin/BDD test cases, JUnit XML ingestion, flaky-test
quarantine, and a live Requirement Traceability Matrix.

## What's real

- `POST /test-plans`, `GET /test-plans` — plans tied to a `services/pm` project.
- `POST /test-plans/:id/cases` — add a case, optionally with Gherkin
  (`Given`/`When`/`Then`) text, parsed via `src/gherkin/gherkin.ts`, and an
  optional `requirementTicketId` linking it to a `services/pm` ticket.
- `POST /test-plans/:planId/ingest-junit` — parses a real JUnit XML report
  (Cypress/Playwright/Selenium-shaped), auto-creates unseen test cases,
  records each execution, and runs flaky detection after every ingest.
- `GET /flaky-tests` — quarantined tests (last 5 executions contain both a
  pass and a fail); `POST /flaky-tests/:id/unquarantine` to clear one.
- `GET /rtm?projectId=...` — live Requirement Traceability Matrix: fetches
  requirement-typed tickets from `services/pm` over HTTP and reports each
  one's linked test cases + latest pass/fail status.

## What's not (⚪)

- Manual test-step execution logging (only automated/JUnit-ingested results exist).
- RTM's Code and Release-signoff columns (only Tests are joined in today —
  linking commits/PRs from `services/git-host` and release tickets is the
  next RTM iteration).
- A real ML flaky-test model — today's quarantine rule is a simple
  last-5-executions heuristic, documented as a deliberate baseline in
  `test-executions.service.ts`.
