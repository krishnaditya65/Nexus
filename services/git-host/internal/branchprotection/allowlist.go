package branchprotection

import (
	"context"
	"database/sql"
	"fmt"
	"path/filepath"

	"github.com/nexus/git-host/internal/db"
)

// AllowlistEntry — one user permitted to merge into a branch pattern,
// independent of branch_protection_rules' review-count requirement (see
// db.go's schema docblock for how these two concepts differ).
type AllowlistEntry struct {
	ID            string `json:"id"`
	RepoName      string `json:"repoName"`
	BranchPattern string `json:"branchPattern"`
	UserID        string `json:"userId"`
}

func AddAllowlistEntry(ctx context.Context, tenantID, repoName, branchPattern, userID string) (*AllowlistEntry, error) {
	var e AllowlistEntry
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, `
			insert into branch_push_allowlist (tenant_id, repo_name, branch_pattern, user_id)
			values ($1, $2, $3, $4)
			on conflict (tenant_id, repo_name, branch_pattern, user_id) do nothing
			returning id, repo_name, branch_pattern, user_id`,
			tenantID, repoName, branchPattern, userID,
		).Scan(&e.ID, &e.RepoName, &e.BranchPattern, &e.UserID)
	})
	if err == sql.ErrNoRows {
		// Already present (the on-conflict no-op) — not an error, same
		// "idempotent add" stance as devpanel's commit-link recording.
		return &AllowlistEntry{RepoName: repoName, BranchPattern: branchPattern, UserID: userID}, nil
	}
	if err != nil {
		return nil, err
	}
	return &e, nil
}

func RemoveAllowlistEntry(ctx context.Context, tenantID, entryID string) error {
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `delete from branch_push_allowlist where id = $1`, entryID)
		return err
	})
}

func ListAllowlist(ctx context.Context, tenantID, repoName string) ([]AllowlistEntry, error) {
	var entries []AllowlistEntry
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx,
			`select id, repo_name, branch_pattern, user_id from branch_push_allowlist
			 where tenant_id = $1 and repo_name = $2 order by branch_pattern`,
			tenantID, repoName,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var e AllowlistEntry
			if err := rows.Scan(&e.ID, &e.RepoName, &e.BranchPattern, &e.UserID); err != nil {
				return err
			}
			entries = append(entries, e)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	if entries == nil {
		entries = []AllowlistEntry{}
	}
	return entries, nil
}

// IsUserAllowed checks whether userID may merge into targetBranch,
// fail-open (true) when no allowlist entries exist for ANY pattern
// matching targetBranch in this repo — same "unconfigured means
// unrestricted" stance as branch_protection_rules and, elsewhere in this
// platform, tenant_ip_allowlist. Pure logic over the fetched rows lives
// in isUserAllowedAmong below so it's unit-testable without a database.
func IsUserAllowed(ctx context.Context, tenantID, repoName, targetBranch, userID string) (bool, error) {
	var entries []AllowlistEntry
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx,
			`select id, repo_name, branch_pattern, user_id from branch_push_allowlist
			 where tenant_id = $1 and repo_name = $2`,
			tenantID, repoName,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var e AllowlistEntry
			if err := rows.Scan(&e.ID, &e.RepoName, &e.BranchPattern, &e.UserID); err != nil {
				return err
			}
			entries = append(entries, e)
		}
		return rows.Err()
	})
	if err != nil {
		return false, err
	}
	return isUserAllowedAmong(entries, targetBranch, userID)
}

// isUserAllowedAmong — pure, exported for unit tests (branchprotection_test.go).
// A malformed BranchPattern is surfaced as an error rather than silently
// treated as "doesn't match": given this allowlist's fail-open design (no
// matching entry => unrestricted), silently skipping a bad pattern would
// invert an admin's intent and quietly disable the restriction they
// configured, so callers must fail closed instead.
func isUserAllowedAmong(entries []AllowlistEntry, targetBranch, userID string) (bool, error) {
	matching := false
	for _, e := range entries {
		ok, err := filepath.Match(e.BranchPattern, targetBranch)
		if err != nil {
			return false, fmt.Errorf("allowlist entry %q has invalid branch pattern %q: %w", e.ID, e.BranchPattern, err)
		}
		if ok {
			matching = true
			if e.UserID == userID {
				return true, nil
			}
		}
	}
	// No entry for any pattern matching this branch at all => unrestricted
	// (fail-open). At least one matching pattern exists, but this user
	// isn't in it => blocked.
	return !matching, nil
}
