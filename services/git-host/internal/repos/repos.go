// Package repos manages the on-disk layout of bare repositories, scoped by
// tenant: {ROOT}/{tenantID}/{repoName}.git. Tenant isolation here is
// filesystem-level, mirroring the RLS approach used in the Postgres services.
package repos

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

var nameRE = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)

func Root() string {
	root := os.Getenv("GIT_REPOS_ROOT")
	if root == "" {
		root = "/data/repos"
	}
	return root
}

// ValidName rejects anything that isn't a plain repo name — blocks path
// traversal ("../../etc") before it ever reaches the filesystem or git CLI.
func ValidName(name string) bool {
	return nameRE.MatchString(name)
}

func Path(tenantID, repoName string) (string, error) {
	if !ValidName(repoName) {
		return "", fmt.Errorf("invalid repo name: %q", repoName)
	}
	return filepath.Join(Root(), tenantID, repoName+".git"), nil
}

func Create(tenantID, repoName string) (string, error) {
	path, err := Path(tenantID, repoName)
	if err != nil {
		return "", err
	}
	if _, err := os.Stat(path); err == nil {
		return "", fmt.Errorf("repo already exists")
	}
	if err := os.MkdirAll(path, 0o755); err != nil {
		return "", err
	}
	cmd := exec.Command("git", "init", "--bare", path)
	if out, err := cmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git init --bare failed: %w: %s", err, out)
	}

	// git-http-backend refuses receive-pack (push) on any repo unless this
	// is explicitly true — GIT_HTTP_EXPORT_ALL (see gitcgi.Serve) only
	// covers read access (upload-pack/dumb-HTTP fetch), not writes. Without
	// this every push 403s regardless of the caller's JWT/RBAC having
	// already authorized them — caught live via git-host's first UI pass
	// (clone → commit → push all the way through, not just an API call).
	configCmd := exec.Command("git", "-C", path, "config", "http.receivepack", "true")
	if out, err := configCmd.CombinedOutput(); err != nil {
		return "", fmt.Errorf("git config http.receivepack failed: %w: %s", err, out)
	}
	return path, nil
}

func Exists(tenantID, repoName string) bool {
	path, err := Path(tenantID, repoName)
	if err != nil {
		return false
	}
	_, statErr := os.Stat(path)
	return statErr == nil
}

// List enumerates a tenant's repos by reading its directory — repos live
// on disk, not in Postgres, so there's no table to SELECT from (mirrors
// how Exists/Create work). A tenant with no repos yet (directory doesn't
// exist) returns an empty list, not an error — the same "nothing yet"
// semantics every other list endpoint in this platform uses.
func List(tenantID string) ([]string, error) {
	tenantRoot := filepath.Join(Root(), tenantID)
	entries, err := os.ReadDir(tenantRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return []string{}, nil
		}
		return nil, err
	}

	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() || !strings.HasSuffix(e.Name(), ".git") {
			continue
		}
		names = append(names, strings.TrimSuffix(e.Name(), ".git"))
	}
	sort.Strings(names)
	return names, nil
}
