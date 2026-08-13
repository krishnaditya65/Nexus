// Package devpanel closes docs/FEATURES.md §13.5's "Development Panel" gap
// — the single most-used Jira+VCS integration point, and previously
// completely absent: tickets and PRs/commits were two islands connected
// only by a human manually pasting a link in a description.
//
// The correlation mechanism is a Jira-style ticket-key regex applied to
// commit subjects and PR titles at push/PR-create time — the exact
// convention `services/pm`'s own tickets already use for display
// (`{project.key}-{ticket_number}`, e.g. "CONN-42", see
// services/pm/migrations/001_init.sql). This is a documented heuristic,
// not a guaranteed-correct parse: a commit message that happens to contain
// a similarly-shaped string with no real ticket behind it will link to
// nothing when queried (the query is keyed by ticket, so a bogus key just
// never gets looked up); a real commit that references a ticket without
// the exact "KEY-123" shape in its subject won't be found. Same honesty
// this build already applies to secretscan's rule patterns.
package devpanel

import (
	"context"
	"database/sql"
	"regexp"

	"github.com/nexus/git-host/internal/browse"
	"github.com/nexus/git-host/internal/db"
)

// Bounded to 2-10 uppercase-alnum characters for the key prefix — long
// enough for any real project key, short enough that an all-caps
// changelog heading or shouted word in a commit message ("FIX-3 typos"
// style false positives are rare, but a 40-character screaming-case
// constant name followed by a stray hyphen-digit would otherwise also
// match without the upper bound).
var ticketKeyRE = regexp.MustCompile(`\b[A-Z][A-Z0-9]{1,9}-\d+\b`)

// ExtractTicketKeys returns the unique, order-preserved set of ticket-key
// matches in a string (a commit subject or PR title).
func ExtractTicketKeys(text string) []string {
	matches := ticketKeyRE.FindAllString(text, -1)
	seen := make(map[string]bool, len(matches))
	out := make([]string, 0, len(matches))
	for _, m := range matches {
		if !seen[m] {
			seen[m] = true
			out = append(out, m)
		}
	}
	return out
}

// RecordCommitLinks scans a batch of commits (as returned by
// browse.CommitLog) for ticket keys and persists any found, deduplicated
// via the table's own unique constraint (`on conflict do nothing`) — safe
// to call repeatedly on overlapping commit ranges across pushes, same
// idempotency shape as §11.9's GitHub connector sync.
func RecordCommitLinks(ctx context.Context, tenantID, repoName string, commits []browse.Commit) error {
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		for _, c := range commits {
			keys := ExtractTicketKeys(c.Subject)
			for _, key := range keys {
				if _, err := tx.ExecContext(ctx, `
					insert into commit_ticket_links (tenant_id, repo_name, commit_sha, ticket_key, commit_subject, author_email, committed_at)
					values ($1, $2, $3, $4, $5, $6, $7)
					on conflict (tenant_id, repo_name, commit_sha, ticket_key) do nothing`,
					tenantID, repoName, c.SHA, key, c.Subject, c.Email, c.Date,
				); err != nil {
					return err
				}
			}
		}
		return nil
	})
}

// RecordPRLink scans a PR's title for ticket keys and persists any found.
// Called once at PR creation — a PR's title can still change after the
// fact (not re-scanned on edit in this build; same "index at write time"
// scope every other write-triggered index in this platform uses, e.g.
// comms' message search).
func RecordPRLink(ctx context.Context, tenantID, repoName, prID, title string) error {
	keys := ExtractTicketKeys(title)
	if len(keys) == 0 {
		return nil
	}
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		for _, key := range keys {
			if _, err := tx.ExecContext(ctx, `
				insert into pr_ticket_links (tenant_id, repo_name, pr_id, ticket_key)
				values ($1, $2, $3, $4)
				on conflict (tenant_id, pr_id, ticket_key) do nothing`,
				tenantID, repoName, prID, key,
			); err != nil {
				return err
			}
		}
		return nil
	})
}

type LinkedCommit struct {
	RepoName      string `json:"repoName"`
	CommitSHA     string `json:"commitSha"`
	CommitSubject string `json:"commitSubject"`
	AuthorEmail   string `json:"authorEmail"`
	CommittedAt   string `json:"committedAt"`
}

type LinkedPullRequest struct {
	RepoName     string  `json:"repoName"`
	PRID         string  `json:"prId"`
	Title        string  `json:"title"`
	Status       string  `json:"status"`
	IsDraft      bool    `json:"isDraft"`
	SourceBranch string  `json:"sourceBranch"`
	TargetBranch string  `json:"targetBranch"`
	CreatedAt    string  `json:"createdAt"`
	MergedAt     *string `json:"mergedAt,omitempty"`
}

// DevPanel is the read side: everything linked to one ticket key, across
// every repo in the tenant — what a ticket detail page's "Development"
// section renders. `ticketKey` isn't validated against services/pm (this
// service has no live channel to pm's tickets table, same
// cross-service-boundary shape as every other service pair in this
// platform) — an unknown/nonexistent key just returns two empty lists,
// not an error, matching this platform's established "unconfigured is
// empty, not broken" stance (e.g. RolesGuard's no-@Roles-decorator case).
func DevPanel(ctx context.Context, tenantID, ticketKey string) ([]LinkedCommit, []LinkedPullRequest, error) {
	var commits []LinkedCommit
	var prs []LinkedPullRequest

	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `
			select repo_name, commit_sha, commit_subject, author_email, committed_at::text
			from commit_ticket_links
			where tenant_id = $1 and ticket_key = $2
			order by committed_at desc`,
			tenantID, ticketKey,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var c LinkedCommit
			if err := rows.Scan(&c.RepoName, &c.CommitSHA, &c.CommitSubject, &c.AuthorEmail, &c.CommittedAt); err != nil {
				return err
			}
			commits = append(commits, c)
		}
		if err := rows.Err(); err != nil {
			return err
		}

		prRows, err := tx.QueryContext(ctx, `
			select ptl.repo_name, pr.id, pr.title, pr.status, pr.is_draft, pr.source_branch, pr.target_branch, pr.created_at::text, pr.merged_at::text
			from pr_ticket_links ptl
			join pull_requests pr on pr.id = ptl.pr_id
			where ptl.tenant_id = $1 and ptl.ticket_key = $2
			order by pr.created_at desc`,
			tenantID, ticketKey,
		)
		if err != nil {
			return err
		}
		defer prRows.Close()
		for prRows.Next() {
			var p LinkedPullRequest
			var mergedAt sql.NullString
			if err := prRows.Scan(&p.RepoName, &p.PRID, &p.Title, &p.Status, &p.IsDraft, &p.SourceBranch, &p.TargetBranch, &p.CreatedAt, &mergedAt); err != nil {
				return err
			}
			if mergedAt.Valid {
				p.MergedAt = &mergedAt.String
			}
			prs = append(prs, p)
		}
		return prRows.Err()
	})

	if commits == nil {
		commits = []LinkedCommit{}
	}
	if prs == nil {
		prs = []LinkedPullRequest{}
	}
	return commits, prs, err
}
