// Package db provides git-host's Postgres access for pull-request metadata,
// branch protection rules, and reviews — everything that isn't the actual
// Git object data (which stays on disk via internal/repos, per the existing
// architecture). Follows the same tenant-isolation convention as every
// NestJS service: FORCE ROW LEVEL SECURITY on every table, runtime connects
// as the non-superuser eos_app role, migrations run once at startup as the
// eos owner. See docs/ARCHITECTURE.md's Multi-tenancy model section — this
// is the one place that convention had to be reimplemented outside NestJS
// rather than copied from services/pm's skeleton, since Go has no
// TypeORM-style migration runner to reuse.
package db

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"regexp"

	_ "github.com/lib/pq"
)

var uuidRE = regexp.MustCompile(`^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`)

// isValidTenantID is the one thing standing between WithTenant's `SET
// LOCAL app.tenant_id = '<tenantID>'` string interpolation (necessary
// because SET LOCAL doesn't support parameterized values, same
// constraint every NestJS service's pool.ts documents) and a SQL
// injection — pulled out as its own function specifically so that
// property can be pinned down with a unit test independent of a real
// database connection (docs/FEATURES.md test-coverage fast-follow).
func isValidTenantID(tenantID string) bool {
	return uuidRE.MatchString(tenantID)
}

// Pool is the long-lived runtime connection, authenticated as eos_app.
var Pool *sql.DB

const schema = `
create extension if not exists "pgcrypto";

create table if not exists pull_requests (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  title text not null,
  description text not null default '',
  source_branch text not null,
  target_branch text not null default 'main',
  status text not null default 'open', -- 'open' | 'merged' | 'closed'
  is_draft boolean not null default false,
  author_user_id uuid not null,
  created_at timestamptz not null default now(),
  merged_at timestamptz
);
alter table pull_requests add column if not exists is_draft boolean not null default false;
alter table pull_requests enable row level security;
alter table pull_requests force row level security;
drop policy if exists tenant_isolation_pull_requests on pull_requests;
create policy tenant_isolation_pull_requests on pull_requests
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists pr_reviewers (
  pr_id uuid not null references pull_requests(id) on delete cascade,
  tenant_id uuid not null,
  user_id uuid not null,
  status text not null default 'pending', -- 'pending' | 'approved' | 'changes_requested'
  reviewed_at timestamptz,
  primary key (pr_id, user_id)
);
alter table pr_reviewers enable row level security;
alter table pr_reviewers force row level security;
drop policy if exists tenant_isolation_pr_reviewers on pr_reviewers;
create policy tenant_isolation_pr_reviewers on pr_reviewers
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

create table if not exists pr_comments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  pr_id uuid not null references pull_requests(id) on delete cascade,
  author_user_id uuid not null,
  body text not null,
  file_path text,
  line_number int,
  created_at timestamptz not null default now()
);
alter table pr_comments enable row level security;
alter table pr_comments force row level security;
drop policy if exists tenant_isolation_pr_comments on pr_comments;
create policy tenant_isolation_pr_comments on pr_comments
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- One row per (tenant, repo, branch pattern) — 'main', 'release/*', etc.
create table if not exists branch_protection_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  branch_pattern text not null,
  require_reviews_count int not null default 1,
  require_codeowner_review boolean not null default false,
  created_at timestamptz not null default now(),
  unique (tenant_id, repo_name, branch_pattern)
);
alter table branch_protection_rules enable row level security;
alter table branch_protection_rules force row level security;
drop policy if exists tenant_isolation_branch_protection_rules on branch_protection_rules;
create policy tenant_isolation_branch_protection_rules on branch_protection_rules
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Branch-level RBAC beyond CODEOWNERS (docs/FEATURES.md §11.1) — an
-- explicit per-branch-pattern merge allowlist, genuinely distinct from
-- branch_protection_rules above (that's "how many reviews," this is
-- "which specific people, full stop, regardless of review count").
-- Fail-open when no entries exist for a (repo, pattern) — same
-- discipline as services/auth's tenant_ip_allowlist: a repo that never
-- configured this isn't locked out. Enforced at PR-merge time (see
-- pullrequests.Merge) — not direct-push interception, since this
-- platform's git-host doesn't intercept raw git wire-protocol pushes
-- today; disclosed scope, not silently narrower than it sounds.
create table if not exists branch_push_allowlist (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  branch_pattern text not null,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, repo_name, branch_pattern, user_id)
);
alter table branch_push_allowlist enable row level security;
alter table branch_push_allowlist force row level security;
drop policy if exists tenant_isolation_branch_push_allowlist on branch_push_allowlist;
create policy tenant_isolation_branch_push_allowlist on branch_push_allowlist
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);

-- Secret scanning findings (docs/FEATURES.md §3/§10 "Advanced Security" —
-- see internal/secretscan for the scanner). Refreshed (delete + reinsert)
-- for a given (repo, branch) on every push that touches it, rather than
-- accumulated forever — a resolved/removed secret should stop showing up,
-- same "current state, not an event log" shape as branch_protection_rules.
create table if not exists security_findings (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  branch text not null,
  commit_sha text not null,
  file_path text not null,
  line_number int not null,
  rule_name text not null,
  redacted_snippet text not null,
  created_at timestamptz not null default now()
);
alter table security_findings enable row level security;
alter table security_findings force row level security;
drop policy if exists tenant_isolation_security_findings on security_findings;
create policy tenant_isolation_security_findings on security_findings
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create index if not exists idx_security_findings_repo on security_findings (tenant_id, repo_name);

-- Development Panel (docs/FEATURES.md §13.5) — the ticket<->commit/PR
-- correlation this platform never had: services/pm's tickets and
-- git-host's commits/PRs were two islands connected only by a human
-- manually pasting a link in a description. Populated by scanning commit
-- subjects and PR titles for a Jira-style ticket-key pattern (see
-- internal/devpanel's docblock for the exact regex and its disclosed
-- false-positive/false-negative tradeoffs) — an explicit, documented
-- heuristic, same honesty this build already applies to secretscan's rule
-- patterns and the flaky-test quarantine heuristic.
create table if not exists commit_ticket_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  commit_sha text not null,
  ticket_key text not null,
  commit_subject text not null,
  author_email text not null,
  committed_at timestamptz not null,
  discovered_at timestamptz not null default now(),
  unique (tenant_id, repo_name, commit_sha, ticket_key)
);
alter table commit_ticket_links enable row level security;
alter table commit_ticket_links force row level security;
drop policy if exists tenant_isolation_commit_ticket_links on commit_ticket_links;
create policy tenant_isolation_commit_ticket_links on commit_ticket_links
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create index if not exists idx_commit_ticket_links_key on commit_ticket_links (tenant_id, ticket_key);

create table if not exists pr_ticket_links (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  repo_name text not null,
  pr_id uuid not null references pull_requests(id) on delete cascade,
  ticket_key text not null,
  discovered_at timestamptz not null default now(),
  unique (tenant_id, pr_id, ticket_key)
);
alter table pr_ticket_links enable row level security;
alter table pr_ticket_links force row level security;
drop policy if exists tenant_isolation_pr_ticket_links on pr_ticket_links;
create policy tenant_isolation_pr_ticket_links on pr_ticket_links
  using (tenant_id = current_setting('app.tenant_id', true)::uuid);
create index if not exists idx_pr_ticket_links_key on pr_ticket_links (tenant_id, ticket_key);

grant usage on schema public to eos_app;
grant select, insert, update, delete on all tables in schema public to eos_app;
alter default privileges in schema public grant select, insert, update, delete on tables to eos_app;
`

// RunMigrationsAndConnect applies the schema above using the eos owner role
// (has CREATE TABLE / RLS-policy privileges), then opens the long-lived
// runtime pool as eos_app. Called once at startup — see cmd/server/main.go.
func RunMigrationsAndConnect() error {
	migrationURL := os.Getenv("MIGRATION_DATABASE_URL")
	if migrationURL == "" {
		migrationURL = "postgres://eos:eos_dev_password@localhost:5432/eos_git?sslmode=disable"
	}
	ownerDB, err := sql.Open("postgres", migrationURL)
	if err != nil {
		return fmt.Errorf("open migration connection: %w", err)
	}
	defer ownerDB.Close()
	if _, err := ownerDB.Exec(schema); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}

	appURL := os.Getenv("DATABASE_URL")
	if appURL == "" {
		appURL = "postgres://eos_app:eos_app_dev_password@localhost:5432/eos_git?sslmode=disable"
	}
	Pool, err = sql.Open("postgres", appURL)
	if err != nil {
		return fmt.Errorf("open runtime connection: %w", err)
	}
	return Pool.Ping()
}

// WithTenant runs fn inside a transaction with app.tenant_id set via SET
// LOCAL, mirroring services/pm's withTenant helper — RLS enforces isolation
// even if a query inside fn forgets a WHERE clause.
func WithTenant(ctx context.Context, tenantID string, fn func(tx *sql.Tx) error) error {
	if !isValidTenantID(tenantID) {
		return fmt.Errorf("invalid tenantID format: %q", tenantID)
	}
	tx, err := Pool.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	// SET LOCAL doesn't support parameterized values; tenantID is validated
	// as a strict UUID above, so string interpolation here is safe — same
	// reasoning as pool.ts's withTenant in every NestJS service.
	if _, err := tx.ExecContext(ctx, fmt.Sprintf("SET LOCAL app.tenant_id = '%s'", tenantID)); err != nil {
		tx.Rollback()
		return err
	}
	if err := fn(tx); err != nil {
		tx.Rollback()
		return err
	}
	return tx.Commit()
}
