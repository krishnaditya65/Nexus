// Package browse reads a bare repo's content without ever cloning or
// checking it out — every operation shells out to a read-only `git`
// plumbing command against the bare repo path (the same one repos.Path
// resolves), the same way GitHub/ADO/GitLab's own web code-browsers work.
// This is the piece that was missing for git-host to be an actual "browse
// my code in the product" experience rather than just a clone/push/PR
// target: until this package, the only way to see a file's content was to
// `git clone` outside the app entirely.
package browse

import (
	"bytes"
	"fmt"
	"os/exec"
	"strconv"
	"strings"
)

type Branch struct {
	Name      string `json:"name"`
	CommitSHA string `json:"commitSha"`
	IsDefault bool   `json:"isDefault"`
}

type TreeEntry struct {
	Name string `json:"name"`
	Path string `json:"path"`
	Type string `json:"type"` // "blob" | "tree"
	Size int64  `json:"size,omitempty"`
	SHA  string `json:"sha"`
}

type Commit struct {
	SHA     string `json:"sha"`
	Author  string `json:"author"`
	Email   string `json:"email"`
	Date    string `json:"date"`
	Subject string `json:"subject"`
}

func run(repoPath string, args ...string) (string, error) {
	cmd := exec.Command("git", append([]string{"-C", repoPath}, args...)...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		return "", fmt.Errorf("git %s: %w: %s", strings.Join(args, " "), err, stderr.String())
	}
	return stdout.String(), nil
}

// DefaultBranch resolves the bare repo's HEAD symbolic ref (what a fresh
// `git clone` would check out) — a fresh `git init --bare` repo has no
// commits yet and HEAD points nowhere resolvable, in which case this
// returns "" rather than an error (an empty repo is a valid, common state,
// not a failure).
func DefaultBranch(repoPath string) (string, error) {
	out, err := run(repoPath, "symbolic-ref", "--short", "HEAD")
	if err != nil {
		return "", nil
	}
	return strings.TrimSpace(out), nil
}

func Branches(repoPath string) ([]Branch, error) {
	defaultBranch, _ := DefaultBranch(repoPath)
	out, err := run(repoPath, "for-each-ref", "--format=%(refname:short) %(objectname)", "refs/heads")
	if err != nil {
		return nil, err
	}
	var branches []Branch
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, " ", 2)
		if len(parts) != 2 {
			continue
		}
		branches = append(branches, Branch{Name: parts[0], CommitSHA: parts[1], IsDefault: parts[0] == defaultBranch})
	}
	return branches, nil
}

func Tags(repoPath string) ([]string, error) {
	out, err := run(repoPath, "tag", "--list")
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return []string{}, nil
	}
	return strings.Split(trimmed, "\n"), nil
}

// Tree lists the entries of a directory at `ref` — root when path is "".
// Uses `<ref>:<path>` tree-ish syntax (the same one `git show <ref>:<path>`
// uses for blobs below), not a recursive walk — one directory level per
// call, exactly what a code-browser's file-tree UI paginates through.
func Tree(repoPath, ref, path string) ([]TreeEntry, error) {
	treeish := ref
	if path != "" {
		treeish = ref + ":" + path
	}
	out, err := run(repoPath, "ls-tree", "-l", treeish)
	if err != nil {
		return nil, err
	}
	var entries []TreeEntry
	for _, line := range strings.Split(strings.TrimSpace(out), "\n") {
		if line == "" {
			continue
		}
		// Format: "<mode> <type> <sha> <size>\t<name>"
		tabParts := strings.SplitN(line, "\t", 2)
		if len(tabParts) != 2 {
			continue
		}
		name := tabParts[1]
		fields := strings.Fields(tabParts[0])
		if len(fields) != 4 {
			continue
		}
		entryType := fields[1] // "blob" or "tree"
		sha := fields[2]
		var size int64
		if fields[3] != "-" {
			size, _ = strconv.ParseInt(fields[3], 10, 64)
		}
		entryPath := name
		if path != "" {
			entryPath = path + "/" + name
		}
		entries = append(entries, TreeEntry{Name: name, Path: entryPath, Type: entryType, Size: size, SHA: sha})
	}
	return entries, nil
}

// Blob returns a file's raw content at `ref:path`. Binary detection is
// left to the caller (apps/web) via a simple heuristic on the response —
// this just returns bytes as git has them, same as `git show` would.
func Blob(repoPath, ref, path string) (string, error) {
	return run(repoPath, "show", ref+":"+path)
}

// CommitLog returns commit history reachable from `ref`, optionally
// filtered to commits touching `path` (empty = whole repo). Fields are
// NUL-delimited within a record and newline-delimited between records —
// commit subjects can contain almost anything except NUL, so this is the
// one separator scheme that can't collide with real commit message
// content (a literal tab or pipe in a subject would silently corrupt a
// naively tab/pipe-delimited log).
func CommitLog(repoPath, ref, path string, limit int) ([]Commit, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	args := []string{"log", ref, "--max-count=" + strconv.Itoa(limit), "--format=%H%x00%an%x00%ae%x00%aI%x00%s"}
	if path != "" {
		args = append(args, "--", path)
	}
	out, err := run(repoPath, args...)
	if err != nil {
		return nil, err
	}
	trimmed := strings.TrimSpace(out)
	if trimmed == "" {
		return []Commit{}, nil
	}
	var commits []Commit
	for _, line := range strings.Split(trimmed, "\n") {
		fields := strings.Split(line, "\x00")
		if len(fields) != 5 {
			continue
		}
		commits = append(commits, Commit{SHA: fields[0], Author: fields[1], Email: fields[2], Date: fields[3], Subject: fields[4]})
	}
	return commits, nil
}

type BlameLine struct {
	LineNumber  int    `json:"lineNumber"`
	SHA         string `json:"sha"`
	Author      string `json:"author"`
	AuthorEmail string `json:"authorEmail"`
	AuthorTime  string `json:"authorTime"`
	Summary     string `json:"summary"`
	Content     string `json:"content"`
}

// Blame runs `git blame --line-porcelain`, which — unlike the default
// incremental porcelain format that omits metadata for lines already
// attributed to a seen commit — repeats every line's full commit info,
// making it parseable one line-block at a time without carrying state
// across blocks for a repeated commit.
func Blame(repoPath, ref, path string) ([]BlameLine, error) {
	out, err := run(repoPath, "blame", "--line-porcelain", ref, "--", path)
	if err != nil {
		return nil, err
	}
	var lines []BlameLine
	var current BlameLine
	lineNumber := 0
	for _, raw := range strings.Split(out, "\n") {
		switch {
		case len(raw) > 40 && raw[40] == ' ' && isHexPrefix(raw):
			// Header line: "<sha> <orig-line> <final-line> [<group-size>]"
			fields := strings.Fields(raw)
			lineNumber++
			current = BlameLine{LineNumber: lineNumber, SHA: fields[0]}
		case strings.HasPrefix(raw, "author "):
			current.Author = strings.TrimPrefix(raw, "author ")
		case strings.HasPrefix(raw, "author-mail "):
			// git emits this as "<name@example.com>" (angle brackets
			// included) — stripped here so callers get a plain, directly
			// comparable-against-users.email address, not a format only
			// git itself would recognize.
			current.AuthorEmail = strings.Trim(strings.TrimPrefix(raw, "author-mail "), "<>")
		case strings.HasPrefix(raw, "author-time "):
			current.AuthorTime = strings.TrimPrefix(raw, "author-time ")
		case strings.HasPrefix(raw, "summary "):
			current.Summary = strings.TrimPrefix(raw, "summary ")
		case strings.HasPrefix(raw, "\t"):
			current.Content = strings.TrimPrefix(raw, "\t")
			lines = append(lines, current)
		}
	}
	return lines, nil
}

func isHexPrefix(s string) bool {
	for i := 0; i < 40; i++ {
		c := s[i]
		if !((c >= '0' && c <= '9') || (c >= 'a' && c <= 'f')) {
			return false
		}
	}
	return true
}
