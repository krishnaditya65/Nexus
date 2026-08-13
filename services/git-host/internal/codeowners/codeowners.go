// Package codeowners implements just enough of GitHub's CODEOWNERS
// convention to compute which owners are responsible for a given set of
// changed file paths: a plain-text file at the repo root, each line
// `<path-pattern> <owner> [<owner> ...]`, later lines override earlier
// matches for the same path (the same precedence rule GitHub itself uses).
// Owners are opaque strings here (email or username) — resolving them to
// platform user IDs is the caller's job, not this package's.
package codeowners

import (
	"bufio"
	"os/exec"
	"strings"
)

type Rule struct {
	PathPrefix string
	Owners     []string
}

// Parse reads `<pattern> <owner...>` lines, skipping blanks and `#` comments.
func Parse(content string) []Rule {
	var rules []Rule
	scanner := bufio.NewScanner(strings.NewReader(content))
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) < 2 {
			continue
		}
		rules = append(rules, Rule{PathPrefix: strings.TrimPrefix(fields[0], "/"), Owners: fields[1:]})
	}
	return rules
}

// OwnersFor returns the deduplicated union of owners whose rule's
// PathPrefix matches any of changedFiles — last-matching-rule-per-file wins
// (CODEOWNERS semantics), but a file with no matching rule contributes
// nothing rather than erroring, since not every path needs an explicit owner.
func OwnersFor(rules []Rule, changedFiles []string) []string {
	seen := map[string]bool{}
	var owners []string
	for _, file := range changedFiles {
		var matched *Rule
		for i := range rules {
			if strings.HasPrefix(file, rules[i].PathPrefix) {
				matched = &rules[i] // later rules override — last match wins
			}
		}
		if matched == nil {
			continue
		}
		for _, o := range matched.Owners {
			if !seen[o] {
				seen[o] = true
				owners = append(owners, o)
			}
		}
	}
	return owners
}

// ReadFromRepo shells out to `git show <branch>:CODEOWNERS` against a bare
// repo — the same technique gitcgi.Serve uses for the smart-HTTP protocol
// (shell out to the real git binary rather than reimplement object reading).
// Returns "" (not an error) when the branch or file doesn't exist yet — a
// repo without a CODEOWNERS file simply has no owner requirements.
func ReadFromRepo(repoPath, branch string) string {
	cmd := exec.Command("git", "-C", repoPath, "show", branch+":CODEOWNERS")
	out, err := cmd.Output()
	if err != nil {
		return ""
	}
	return string(out)
}

// ChangedFiles shells out to `git diff --name-only` between two refs in a
// bare repo — used both for CODEOWNERS matching and for the PR diff summary.
func ChangedFiles(repoPath, baseBranch, headBranch string) ([]string, error) {
	cmd := exec.Command("git", "-C", repoPath, "diff", "--name-only", baseBranch+"..."+headBranch)
	out, err := cmd.Output()
	if err != nil {
		return nil, err
	}
	var files []string
	for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
		if line != "" {
			files = append(files, line)
		}
	}
	return files, nil
}
