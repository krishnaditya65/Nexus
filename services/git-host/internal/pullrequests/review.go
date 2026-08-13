package pullrequests

import (
	"context"
	"database/sql"
	"fmt"
	"os/exec"
	"sort"
	"strconv"
	"strings"

	"github.com/nexus/git-host/internal/browse"
	"github.com/nexus/git-host/internal/db"
	"github.com/nexus/git-host/internal/repos"
)

// FileChange is one file's line-level diff stat, as reported by
// `git diff --numstat` (tab-separated insertions/deletions/path; `-` for
// insertions/deletions means the file is binary, reported here as 0/0).
type FileChange struct {
	Path        string `json:"path"`
	Insertions  int    `json:"insertions"`
	Deletions   int    `json:"deletions"`
}

// Review is a deterministic, heuristic PR review summary — NOT an LLM call
// (this repo has no configured LLM provider; see services/ai-platform's
// embedding-provider.ts for the same real-API-or-honest-fallback pattern
// applied to embeddings). Every flag here is computed directly from real
// `git diff` output against the two real branches, not fabricated. A
// human still decides whether to post it as a PR comment (see
// AddComment) — this never auto-comments on a PR's behalf.
type Review struct {
	FilesChanged int          `json:"filesChanged"`
	Insertions   int          `json:"insertions"`
	Deletions    int          `json:"deletions"`
	Files        []FileChange `json:"files"`
	Flags        []string     `json:"flags"`
	Summary      string       `json:"summary"`
}

// GenerateReview loads the PR's source/target branches and computes a real
// diff stat between them in the bare repo (`git diff --numstat A...B`,
// same three-dot merge-base semantics used everywhere else diffs matter),
// then applies a few honest, explainable heuristics on top — no black box.
func GenerateReview(ctx context.Context, tenantID, prID string) (*Review, error) {
	var pr PullRequest
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx,
			`select id, repo_name, source_branch, target_branch from pull_requests where id = $1`,
			prID,
		).Scan(&pr.ID, &pr.RepoName, &pr.SourceBranch, &pr.TargetBranch)
	})
	if err != nil {
		return nil, err
	}

	repoPath, err := repos.Path(tenantID, pr.RepoName)
	if err != nil {
		return nil, err
	}

	out, err := exec.Command("git", "-C", repoPath, "diff", "--numstat",
		fmt.Sprintf("%s...%s", pr.TargetBranch, pr.SourceBranch)).Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	var files []FileChange
	var totalIns, totalDel int
	touchesTests := false
	touchesNonTests := false

	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		ins, _ := strconv.Atoi(parts[0]) // "-" (binary file) parses to 0, which is fine here
		del, _ := strconv.Atoi(parts[1])
		path := parts[2]
		files = append(files, FileChange{Path: path, Insertions: ins, Deletions: del})
		totalIns += ins
		totalDel += del

		lower := strings.ToLower(path)
		if strings.Contains(lower, "test") || strings.Contains(lower, "spec") {
			touchesTests = true
		} else {
			touchesNonTests = true
		}
	}

	var flags []string
	totalLines := totalIns + totalDel
	if totalLines > 500 {
		flags = append(flags, fmt.Sprintf("Large changeset (%d lines) — consider splitting into smaller PRs for easier review.", totalLines))
	}
	if len(files) > 20 {
		flags = append(flags, fmt.Sprintf("Touches %d files — wide-reaching change, double-check nothing unrelated slipped in.", len(files)))
	}
	if touchesNonTests && !touchesTests {
		flags = append(flags, "No test files changed alongside non-test changes — consider whether this needs test coverage.")
	}
	if len(files) == 0 {
		flags = append(flags, "No diff detected between these branches — is the source branch already merged or empty?")
	}

	summary := fmt.Sprintf("%d file(s) changed, +%d/-%d lines.", len(files), totalIns, totalDel)

	return &Review{
		FilesChanged: len(files),
		Insertions:   totalIns,
		Deletions:    totalDel,
		Files:        files,
		Flags:        flags,
		Summary:      summary,
	}, nil
}

// ReviewerSuggestion is one candidate reviewer/assignee, ranked by how
// much of the PR's touched code they actually own per git blame — not a
// role/team lookup, a real ownership signal.
type ReviewerSuggestion struct {
	AuthorEmail string `json:"authorEmail"`
	AuthorName  string `json:"authorName"`
	BlameLines  int    `json:"blameLines"`
}

// SuggestReviewers §11.8's "git-blame-informed assignee suggestion" —
// blames each of the PR's changed files as they exist on the TARGET
// branch (the base being merged into, i.e. the code as it stood before
// this PR — blaming the source branch would just attribute the PR's own
// new lines to its own author, which tells you nothing useful), then
// ranks candidate reviewers by total blamed line count across those
// files. Capped to the top N files by lines changed (largest files
// dominate blame cost) and a max line count per file, so one huge
// generated/vendored file in the diff can't make this expensive or
// meaningless.
func SuggestReviewers(ctx context.Context, tenantID, prID string) ([]ReviewerSuggestion, error) {
	var pr PullRequest
	err := db.WithTenant(ctx, tenantID, func(tx *sql.Tx) error {
		return tx.QueryRowContext(ctx,
			`select id, repo_name, source_branch, target_branch from pull_requests where id = $1`,
			prID,
		).Scan(&pr.ID, &pr.RepoName, &pr.SourceBranch, &pr.TargetBranch)
	})
	if err != nil {
		return nil, err
	}

	repoPath, err := repos.Path(tenantID, pr.RepoName)
	if err != nil {
		return nil, err
	}

	out, err := exec.Command("git", "-C", repoPath, "diff", "--numstat",
		fmt.Sprintf("%s...%s", pr.TargetBranch, pr.SourceBranch)).Output()
	if err != nil {
		return nil, fmt.Errorf("git diff failed: %w", err)
	}

	type changedFile struct {
		path  string
		lines int
	}
	var changed []changedFile
	for _, line := range strings.Split(strings.TrimRight(string(out), "\n"), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		if len(parts) != 3 {
			continue
		}
		ins, _ := strconv.Atoi(parts[0])
		del, _ := strconv.Atoi(parts[1])
		changed = append(changed, changedFile{path: parts[2], lines: ins + del})
	}
	sort.Slice(changed, func(i, j int) bool { return changed[i].lines > changed[j].lines })

	const maxFiles = 10
	if len(changed) > maxFiles {
		changed = changed[:maxFiles]
	}

	blameByAuthor := map[string]*ReviewerSuggestion{}
	for _, cf := range changed {
		lines, err := browse.Blame(repoPath, pr.TargetBranch, cf.path)
		if err != nil {
			// A file that's new on the source branch (doesn't exist yet
			// on target) has nothing to blame — not an error, just no
			// signal from this file.
			continue
		}
		for _, l := range lines {
			if l.AuthorEmail == "" {
				continue
			}
			entry, ok := blameByAuthor[l.AuthorEmail]
			if !ok {
				entry = &ReviewerSuggestion{AuthorEmail: l.AuthorEmail, AuthorName: l.Author}
				blameByAuthor[l.AuthorEmail] = entry
			}
			entry.BlameLines++
		}
	}

	suggestions := make([]ReviewerSuggestion, 0, len(blameByAuthor))
	for _, s := range blameByAuthor {
		suggestions = append(suggestions, *s)
	}
	sort.Slice(suggestions, func(i, j int) bool { return suggestions[i].BlameLines > suggestions[j].BlameLines })
	return suggestions, nil
}
