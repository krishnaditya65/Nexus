-- §11.5 cross-browser test matrix reporting: adds a browser/OS dimension
-- to test_executions, which previously recorded a single pass/fail/
-- untested per test case with no environment axis at all. JUnit ingestion
-- (junit-parser.ts) has no browser/OS concept in the XML format itself —
-- Playwright/Selenium grids report that out-of-band (project/capability
-- name) — so the ingest endpoint accepts it as an explicit optional param
-- alongside the XML, defaulting to 'unspecified' for callers that don't
-- have a matrix concept at all, matching the "fail open on unconfigured"
-- posture used throughout this platform (see e.g. IP allowlisting).

alter table test_executions add column if not exists browser text not null default 'unspecified';
alter table test_executions add column if not exists os text not null default 'unspecified';

create index if not exists idx_test_executions_browser_os on test_executions (test_case_id, browser, os);
