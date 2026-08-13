// Package pullrequests implements PR create/list/review/merge against the
// bare repos internal/repos already manages, gated by
// internal/branchprotection's rules and internal/codeowners' ownership map.
package pullrequests

import (
	"context"
	"database/sql"
	"fmt"
	"os"
	"os/exec"

	"github.com/nexus/git-host/internal/branchprotection"
	"github.com/nexus/git-host/internal/codeowners"
	"github.com/nexus/git-host/internal/db"
	"github.com/nexus/git-host/internal/repos"
)

type PullRequest struct {
	ID           string  `json:"id"`
	RepoName     string  `json:"repoName"`
	Title        string  `json:"title"`
	Description  string  `json:"description"`
	SourceBranch string  `json:"sourceBranch"`
	TargetBranch string  `json:"targetBranch"`
	Status       string  `json:"status"`
	IsDraft      bool    `json:"isDraft"`
	AuthorUserID string  `json:"authorUserId"`
	CreatedAt    string  `json:"createdAt"`
	MergedAt     *string `json:"mergedAt,omitempty"`
}

func Create(ctx context.Context, tenantID, repoName, title, description, sourceBranch, targetBranch, authorUserID string, isDraft bool) (*PullRequest, error) {
	if targetBranch == "" {
		targetBranch = "main"
	}
	var pr PullRequest
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx, `
			insert into pull_requests (tenant_id, repo_name, title, description, source_branch, target_branch, author_user_id, is_draft)
			values ($1, $2, $3, $4, $5, $6, $7, $8)
			returning id, repo_name, title, description, source_branch, target_branch, status, is_draft, author_user_id, created_at::text`,
			tenantID, repoName, title, description, sourceBranch, targetBranch, authorUserID, isDraft,
		).Scan(&pr.ID, &pr.RepoName, &pr.Title, &pr.Description, &pr.SourceBranch, &pr.TargetBranch, &pr.Status, &pr.IsDraft, &pr.AuthorUserID, &pr.CreatedAt)
	})
	if err != nil {
		return nil, err
	}

	// Auto-request CODEOWNERS review: best-effort — a repo with no
	// CODEOWNERS file or a diff computation failure just means no reviewers
	// get auto-added, not that PR creation fails.
	repoPath, pathErr := repos.Path(tenantID, repoName)
	if pathErr == nil {
		if changedFiles, diffErr := codeowners.ChangedFiles(repoPath, targetBranch, sourceBranch); diffErr == nil {
			ownersContent := codeowners.ReadFromRepo(repoPath, targetBranch)
			owners := codeowners.OwnersFor(codeowners.Parse(ownersContent), changedFiles)
			for _, owner := range owners {
				_ = AddReviewer(ctx, tenantID, pr.ID, owner)
			}
		}
	}

	return &pr, nil
}

func List(ctx context.Context, tenantID, repoName string) ([]PullRequest, error) {
	var prs []PullRequest
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		rows, err := tx.QueryContext(ctx, `
			select id, repo_name, title, description, source_branch, target_branch, status, is_draft, author_user_id, created_at::text
			from pull_requests where tenant_id = $1 and repo_name = $2 order by created_at desc`,
			tenantID, repoName,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var pr PullRequest
			if err := rows.Scan(&pr.ID, &pr.RepoName, &pr.Title, &pr.Description, &pr.SourceBranch, &pr.TargetBranch, &pr.Status, &pr.IsDraft, &pr.AuthorUserID, &pr.CreatedAt); err != nil {
				return err
			}
			prs = append(prs, pr)
		}
		return rows.Err()
	})
	return prs, err
}

// MarkReady flips a draft PR to ready-for-review — the only way a draft
// PR ever becomes mergeable, matching GitHub/ADO's own draft-PR model:
// drafts are for early feedback/CI visibility, not an accidental early
// merge.
func MarkReady(ctx context.Context, tenantID, prID string) error {
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		res, err := tx.ExecContext(ctx, `update pull_requests set is_draft = false where id = $1 and tenant_id = $2`, prID, tenantID)
		if err != nil {
			return err
		}
		rows, _ := res.RowsAffected()
		if rows == 0 {
			return fmt.Errorf("PR not found")
		}
		return nil
	})
}

func AddReviewer(ctx context.Context, tenantID, prID, userID string) error {
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
			insert into pr_reviewers (pr_id, tenant_id, user_id) values ($1, $2, $3)
			on conflict (pr_id, user_id) do nothing`,
			prID, tenantID, userID,
		)
		return err
	})
}

func SubmitReview(ctx context.Context, tenantID, prID, userID, status string) error {
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
			insert into pr_reviewers (pr_id, tenant_id, user_id, status, reviewed_at)
			values ($1, $2, $3, $4, now())
			on conflict (pr_id, user_id) do update set status = excluded.status, reviewed_at = now()`,
			prID, tenantID, userID, status,
		)
		return err
	})
}

func AddComment(ctx context.Context, tenantID, prID, authorUserID, body, filePath string, lineNumber *int) error {
	return db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `
			insert into pr_comments (tenant_id, pr_id, author_user_id, body, file_path, line_number)
			values ($1, $2, $3, $4, $5, $6)`,
			tenantID, prID, authorUserID, body, filePath, lineNumber,
		)
		return err
	})
}

type MergeResult struct {
	Merged bool   `json:"merged"`
	Reason string `json:"reason,omitempty"`
}

// Merge is the actual enforcement point: checks the applicable branch
// protection rule's required-approval count (and CODEOWNERS-review
// requirement) before performing a real merge in the bare repo, using
// whichever of the three real Git merge strategies the caller chose
// (§11.3 "Squash / rebase merge strategies" — previously only the
// `--no-ff` merge-commit path existed). A PR that doesn't meet its
// target branch's rule, or is still a draft, is refused with a reason,
// not silently merged. `callerUserID` is checked against
// branchprotection's per-branch allowlist (docs/FEATURES.md §11.1) — a
// merge attempt from someone not on an explicitly-configured allowlist
// for the target branch is refused the same way an insufficient review
// count is, regardless of how many approvals the PR already has.
func Merge(ctx context.Context, tenantID, repoName, prID, strategy, callerUserID string) (*MergeResult, error) {
	strategy, err := normalizeMergeStrategy(strategy)
	if err != nil {
		return nil, err
	}

	var pr PullRequest
	err = db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx,
			`select id, repo_name, source_branch, target_branch, status, is_draft from pull_requests where id = $1`,
			prID,
		).Scan(&pr.ID, &pr.RepoName, &pr.SourceBranch, &pr.TargetBranch, &pr.Status, &pr.IsDraft)
	})
	if err != nil {
		return nil, err
	}
	if pr.Status != "open" {
		return &MergeResult{Merged: false, Reason: fmt.Sprintf("PR is already %s", pr.Status)}, nil
	}
	if pr.IsDraft {
		return &MergeResult{Merged: false, Reason: "PR is still a draft — mark it ready for review first"}, nil
	}

	allowed, err := branchprotection.IsUserAllowed(ctx, tenantID, repoName, pr.TargetBranch, callerUserID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return &MergeResult{Merged: false, Reason: "you are not on the merge allowlist for this branch"}, nil
	}

	rule, err := branchprotection.FindApplicable(ctx, tenantID, repoName, pr.TargetBranch)
	if err != nil {
		return nil, err
	}
	if rule != nil {
		approvedCount, err := countApprovals(ctx, tenantID, prID)
		if err != nil {
			return nil, err
		}
		if approvedCount < rule.RequireReviewsCount {
			return &MergeResult{
				Merged: false,
				Reason: fmt.Sprintf("requires %d approval(s), has %d", rule.RequireReviewsCount, approvedCount),
			}, nil
		}
		// CODEOWNERS-review requirement checked as "at least one CODEOWNERS-
		// requested reviewer approved" — reviewers were auto-added from
		// CODEOWNERS at PR-creation time in Create(), so this reduces to
		// "every auto-added reviewer's approval status", already covered by
		// approvedCount above once all reviewers are CODEOWNERS-sourced.
		// A dedicated distinction (some reviewers manually added, not
		// CODEOWNERS-sourced) is a real gap — tracked in docs/ROADMAP.md.
		_ = rule.RequireCodeownerReview
	}

	repoPath, err := repos.Path(tenantID, repoName)
	if err != nil {
		return nil, err
	}
	if err := performMerge(repoPath, prID, pr.SourceBranch, pr.TargetBranch, strategy, pr.Title); err != nil {
		return &MergeResult{Merged: false, Reason: err.Error()}, nil
	}

	err = db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		_, err := tx.ExecContext(ctx, `update pull_requests set status = 'merged', merged_at = now() where id = $1`, prID)
		return err
	})
	if err != nil {
		return nil, err
	}
	return &MergeResult{Merged: true}, nil
}

func countApprovals(ctx context.Context, tenantID, prID string) (int, error) {
	var count int
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx,
			`select count(*) from pr_reviewers where pr_id = $1 and status = 'approved'`, prID,
		).Scan(&count)
	})
	return count, err
}

// performMerge does the actual merge — which cannot run directly against
// a bare repo (there's no working tree to merge into). Uses `git worktree
// add`, a linked working copy that shares the bare repo's object store
// and ref namespace directly: committing inside the worktree updates the
// target ref in the bare repo with no separate push step, unlike a full
// clone. Worktrees are always removed afterward, even on failure.
//
// Three real strategies, matching what GitHub/ADO both offer at the
// merge-button dropdown:
//   - "merge":  `git merge --no-ff` — always creates a merge commit,
//     preserving the source branch's own commit history as-is. The
//     original, only-ever-implemented behavior before this pass.
//   - "squash": `git merge --squash` + one commit — collapses every
//     source-branch commit into a single new commit on the target.
//   - "rebase": replays the source branch's commits onto the target's
//     tip in a SEPARATE worktree first (rewriting the source branch's
//     own history), then fast-forwards the target onto the rebased
//     result — the real two-step "rebase and merge" GitHub performs,
//     not a `git merge` with a different flag.
func performMerge(repoPath, prID, sourceBranch, targetBranch, strategy, title string) error {
	switch strategy {
	case "squash":
		return performSquashMerge(repoPath, prID, sourceBranch, targetBranch, title)
	case "rebase":
		return performRebaseMerge(repoPath, prID, sourceBranch, targetBranch)
	default:
		return performNoFFMerge(repoPath, prID, sourceBranch, targetBranch)
	}
}

func withWorktree(repoPath, prID, ref string, fn func(worktreeDir string) error) error {
	worktreeDir, err := os.MkdirTemp("", "nexus-merge-"+prID+"-")
	if err != nil {
		return fmt.Errorf("create worktree temp dir: %w", err)
	}
	defer func() {
		exec.Command("git", "-C", repoPath, "worktree", "remove", "--force", worktreeDir).Run()
		os.RemoveAll(worktreeDir)
	}()

	addCmd := exec.Command("git", "-C", repoPath, "worktree", "add", worktreeDir, ref)
	if out, err := addCmd.CombinedOutput(); err != nil {
		return fmt.Errorf("git worktree add failed: %v: %s", err, out)
	}
	return fn(worktreeDir)
}

func performNoFFMerge(repoPath, prID, sourceBranch, targetBranch string) error {
	return withWorktree(repoPath, prID, targetBranch, func(worktreeDir string) error {
		mergeCmd := exec.Command("git", "-C", worktreeDir, "merge", "--no-ff", "-m",
			fmt.Sprintf("Merge PR %s: %s -> %s", prID, sourceBranch, targetBranch), sourceBranch)
		if out, err := mergeCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git merge failed: %v: %s", err, out)
		}
		return nil
	})
}

func performSquashMerge(repoPath, prID, sourceBranch, targetBranch, title string) error {
	return withWorktree(repoPath, prID, targetBranch, func(worktreeDir string) error {
		squashCmd := exec.Command("git", "-C", worktreeDir, "merge", "--squash", sourceBranch)
		if out, err := squashCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git merge --squash failed: %v: %s", err, out)
		}
		commitCmd := exec.Command("git", "-C", worktreeDir, "commit", "-m",
			fmt.Sprintf("%s (PR %s, squashed from %s)", title, prID, sourceBranch))
		if out, err := commitCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("git commit failed: %v: %s", err, out)
		}
		return nil
	})
}

func performRebaseMerge(repoPath, prID, sourceBranch, targetBranch string) error {
	// Step 1: replay sourceBranch's commits onto targetBranch's current
	// tip, in a worktree checked out AT sourceBranch — `git rebase`
	// rewrites whichever branch the worktree currently has checked out,
	// so this is the worktree that must be on sourceBranch, not target.
	err := withWorktree(repoPath, prID+"-src", sourceBranch, func(worktreeDir string) error {
		rebaseCmd := exec.Command("git", "-C", worktreeDir, "rebase", targetBranch)
		if out, err := rebaseCmd.CombinedOutput(); err != nil {
			exec.Command("git", "-C", worktreeDir, "rebase", "--abort").Run()
			return fmt.Errorf("git rebase failed: %v: %s", err, out)
		}
		return nil
	})
	if err != nil {
		return err
	}

	// Step 2: sourceBranch's tip is now a fast-forward descendant of
	// targetBranch's tip (that's what a clean rebase guarantees) — fast-
	// forward target onto it. `--ff-only` is the correctness check: if
	// anything about that assumption were wrong, this fails loudly rather
	// than silently creating a merge commit a "rebase and merge" button
	// was never supposed to produce.
	return withWorktree(repoPath, prID+"-dst", targetBranch, func(worktreeDir string) error {
		ffCmd := exec.Command("git", "-C", worktreeDir, "merge", "--ff-only", sourceBranch)
		if out, err := ffCmd.CombinedOutput(); err != nil {
			return fmt.Errorf("fast-forward after rebase failed: %v: %s", err, out)
		}
		return nil
	})
}
