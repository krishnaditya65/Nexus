// Package branchprotection manages per-branch-pattern merge requirements
// (minimum approvals, CODEOWNERS review) and the check pull requests must
// pass before pullrequests.Service.Merge allows a merge to proceed.
package branchprotection

import (
	"context"
	"database/sql"
	"path/filepath"

	"github.com/nexus/git-host/internal/db"
)

type Rule struct {
	ID                     string `json:"id"`
	RepoName               string `json:"repoName"`
	BranchPattern          string `json:"branchPattern"`
	RequireReviewsCount    int    `json:"requireReviewsCount"`
	RequireCodeownerReview bool   `json:"requireCodeownerReview"`
}

func Upsert(ctx context.Context, tenantID, repoName, branchPattern string, requireReviews int, requireCodeowner bool) (*Rule, error) {
	var rule Rule
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, `
			insert into branch_protection_rules (tenant_id, repo_name, branch_pattern, require_reviews_count, require_codeowner_review)
			values ($1, $2, $3, $4, $5)
			on conflict (tenant_id, repo_name, branch_pattern) do update
			  set require_reviews_count = excluded.require_reviews_count,
			      require_codeowner_review = excluded.require_codeowner_review
			returning id, repo_name, branch_pattern, require_reviews_count, require_codeowner_review`,
			tenantID, repoName, branchPattern, requireReviews, requireCodeowner,
		).Scan(&rule.ID, &rule.RepoName, &rule.BranchPattern, &rule.RequireReviewsCount, &rule.RequireCodeownerReview)
	})
	if err != nil {
		return nil, err
	}
	return &rule, nil
}

// List returns every branch-protection rule configured for a repo — what
// a settings screen needs to show current config, unlike FindApplicable
// (below) which resolves just the one rule that applies to a specific
// branch at merge time.
func List(ctx context.Context, tenantID, repoName string) ([]Rule, error) {
	var rules []Rule
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx,
			`select id, repo_name, branch_pattern, require_reviews_count, require_codeowner_review
			 from branch_protection_rules where tenant_id = $1 and repo_name = $2 order by branch_pattern`,
			tenantID, repoName,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r Rule
			if err := rows.Scan(&r.ID, &r.RepoName, &r.BranchPattern, &r.RequireReviewsCount, &r.RequireCodeownerReview); err != nil {
				return err
			}
			rules = append(rules, r)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}
	if rules == nil {
		rules = []Rule{}
	}
	return rules, nil
}

// FindApplicable returns the most specific rule (longest matching pattern)
// covering targetBranch, or nil if the branch is unprotected — mirroring
// how GitHub's branch-protection pattern matching resolves overlapping rules.
func FindApplicable(ctx context.Context, tenantID, repoName, targetBranch string) (*Rule, error) {
	var rules []Rule
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx,
			`select id, repo_name, branch_pattern, require_reviews_count, require_codeowner_review
			 from branch_protection_rules where tenant_id = $1 and repo_name = $2`,
			tenantID, repoName,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var r Rule
			if err := rows.Scan(&r.ID, &r.RepoName, &r.BranchPattern, &r.RequireReviewsCount, &r.RequireCodeownerReview); err != nil {
				return err
			}
			rules = append(rules, r)
		}
		return rows.Err()
	})
	if err != nil {
		return nil, err
	}

	var best *Rule
	for i := range rules {
		if matched, _ := filepath.Match(rules[i].BranchPattern, targetBranch); matched {
			if best == nil || len(rules[i].BranchPattern) > len(best.BranchPattern) {
				best = &rules[i]
			}
		}
	}
	return best, nil
}
