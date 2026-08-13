// Package secretscan implements the "secret scanning on push" half of
// docs/FEATURES.md §3/§10 "Advanced Security". Dependency/CVE scanning
// (the other half of that checklist item) is deliberately NOT implemented
// here — it would need a real vulnerability advisory feed (npm audit's
// database, OSV, GitHub Advisory) wired in, and faking that with a
// hand-picked "known bad versions" list would be indistinguishable from
// real coverage while providing none; that stays ⚪ until a real advisory
// source is integrated. What's here is genuinely functional: a real `git
// grep -In -E` against a pushed branch's current tree, matched against a
// small, conservative set of real secret-format regexes (the same shapes
// GitHub's/GitLab's own secret scanners look for — AWS keys, PEM private
// key blocks, GitHub/Slack tokens, generic high-entropy assignments).
package secretscan

import (
	"os/exec"
	"strconv"
	"strings"
)

// Finding is one match: a rule name (not the raw secret) plus a redacted
// snippet — enough to locate and understand the finding without the
// scan's own output becoming a second copy of the leaked secret sitting
// in Postgres.
type Finding struct {
	FilePath string
	Line     int
	RuleName string
	Snippet  string
}

type rule struct {
	name            string
	pattern         string // POSIX extended regex — git grep -E's dialect, not PCRE, so no \s, (?i), or non-capturing groups
	caseInsensitive bool
}

// Ordered so the most specific patterns (AWS/GitHub/Slack's own fixed
// prefixes) are checked before the generic high-entropy fallback, which
// is the noisiest and most prone to a false positive.
var rules = []rule{
	{"AWS Access Key ID", `AKIA[0-9A-Z]{16}`, false},
	{"GitHub Personal Access Token", `ghp_[A-Za-z0-9]{36}`, false},
	{"Slack Token", `xox[baprs]-[A-Za-z0-9-]{10,48}`, false},
	{"Private Key Block", `-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----`, false},
	{"Generic API Key Assignment", `(api[_-]?key|secret|token|password)[[:space:]]*[:=][[:space:]]*['"][A-Za-z0-9_/+=-]{16,}['"]`, true},
}

// Scan runs `git grep` for each rule against ref's tree in repoPath (a
// bare repo) and returns every match, redacted. `git grep` — not reading
// blobs into Go and regexing them one by one — because it's the same tool
// a human would run to check this by hand, and it's fast even on a large
// tree since git does the file enumeration itself.
func Scan(repoPath, ref string) ([]Finding, error) {
	var findings []Finding
	for _, ru := range rules {
		out, err := runGitGrep(repoPath, ref, ru)
		if err != nil {
			// `git grep` exits 1 (not an error) when there are simply no
			// matches for that pattern — only a real execution failure
			// (exit code >1, or no output at all with a non-exit error)
			// should abort the whole scan.
			if exitErr, ok := err.(*exec.ExitError); ok && exitErr.ExitCode() == 1 {
				continue
			}
			return nil, err
		}
		findings = append(findings, parseGrepOutput(out, ru.name)...)
	}
	return findings, nil
}

func runGitGrep(repoPath, ref string, ru rule) (string, error) {
	args := []string{"--git-dir", repoPath, "grep", "-In"}
	if ru.caseInsensitive {
		args = append(args, "-i")
	}
	// "-e <pattern>" rather than a bare trailing pattern arg — several of
	// these patterns start with "-" (e.g. the private-key rule's
	// "-----BEGIN..."), which git grep would otherwise try to parse as an
	// unknown option rather than the regex to search for.
	args = append(args, "-E", "-e", ru.pattern, ref)
	cmd := exec.Command("git", args...)
	out, err := cmd.Output()
	return string(out), err
}

// parseGrepOutput reads "ref:path:line:content" lines (git grep -I -n's
// format when scanning a ref) and redacts the matched secret itself out
// of the stored snippet, keeping only enough surrounding context to
// locate it.
func parseGrepOutput(output, ruleName string) []Finding {
	var findings []Finding
	for _, line := range strings.Split(output, "\n") {
		if line == "" {
			continue
		}
		// ref:path:line:content — split into at most 4 parts since content
		// itself may contain colons.
		parts := strings.SplitN(line, ":", 4)
		if len(parts) < 4 {
			continue
		}
		lineNum, err := strconv.Atoi(parts[2])
		if err != nil {
			continue
		}
		findings = append(findings, Finding{
			FilePath: parts[1],
			Line:     lineNum,
			RuleName: ruleName,
			Snippet:  redact(parts[3]),
		})
	}
	return findings
}

// redact keeps only the first/last few characters of a long line so a
// finding is locatable without the finding itself leaking the secret it's
// reporting.
func redact(content string) string {
	trimmed := strings.TrimSpace(content)
	if len(trimmed) <= 16 {
		return "[redacted]"
	}
	return trimmed[:6] + "…redacted…" + trimmed[len(trimmed)-4:]
}
