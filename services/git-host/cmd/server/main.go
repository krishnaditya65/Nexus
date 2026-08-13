package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/nexus/git-host/internal/auth"
	"github.com/nexus/git-host/internal/browse"
	"github.com/nexus/git-host/internal/db"
	"github.com/nexus/git-host/internal/devpanel"
	"github.com/nexus/git-host/internal/gitcgi"
	"github.com/nexus/git-host/internal/repos"
	"github.com/nexus/git-host/internal/secretscan"
)

// Matches "/{repoName}.git/{rest...}" for the smart-HTTP protocol paths
// (info/refs, git-upload-pack, git-receive-pack) once tenant is resolved.
var repoPathRE = regexp.MustCompile(`^/([a-zA-Z0-9_-]+)\.git(/.*)?$`)

func withAuth(next func(http.ResponseWriter, *http.Request, *auth.Claims)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		claims, err := auth.FromRequest(r)
		if err != nil {
			w.Header().Set("WWW-Authenticate", `Bearer realm="git"`)
			http.Error(w, "unauthorized: "+err.Error(), http.StatusUnauthorized)
			return
		}
		next(w, r, claims)
	}
}

// Every NestJS service in this platform enables CORS via app.enableCors()
// (Nest's built-in middleware); this Go service has no framework
// equivalent and had none wired in at all — every browser-originated
// request to git-host's JSON API (as opposed to `git clone`/`push`, which
// isn't a browser fetch and was never affected) would be silently blocked
// by the browser's CORS check despite the server itself responding 200.
// Caught live while wiring up apps/web's first git-host screens: curl
// doesn't enforce CORS, so this was invisible to every prior test in this
// service's history until an actual cross-origin fetch was exercised.
// Wraps every route the same permissive way Nest's default enableCors()
// does for local/dev use.
func withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization,Content-Type")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

// healthHandler is intentionally NOT wrapped in withAuth — see its
// registration comment above. Real 503 (not a 200 with a "degraded"
// body) when the DB round trip fails, matching the NestJS services'
// health controllers' behavior exactly.
func healthHandler(w http.ResponseWriter, r *http.Request) {
	started := time.Now()
	body := map[string]any{"service": "git-host"}
	if err := db.Pool.Ping(); err != nil {
		body["status"] = "degraded"
		body["dbConnected"] = false
		body["error"] = err.Error()
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(body)
		return
	}
	var memStats runtime.MemStats
	runtime.ReadMemStats(&memStats)
	body["status"] = "ok"
	body["dbConnected"] = true
	body["checkedInMs"] = time.Since(started).Milliseconds()
	body["memoryUsageMb"] = memStats.Sys / 1024 / 1024
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(body)
}

// Dispatches GET (list) vs POST (create) on the same /api/repos path —
// mirrors REST convention (a collection endpoint's verb determines the
// operation) rather than needing two separate routes for one resource.
func reposHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	switch r.Method {
	case http.MethodGet:
		listReposHandler(w, r, claims)
	case http.MethodPost:
		createRepoHandler(w, r, claims)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func listReposHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	names, err := repos.List(claims.TenantID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(names)
}

func createRepoHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	var body struct {
		Name string `json:"name"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	path, err := repos.Create(claims.TenantID, body.Name)
	if err != nil {
		http.Error(w, err.Error(), http.StatusConflict)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"name":     body.Name,
		"path":     path,
		"cloneUrl": "/git/" + body.Name + ".git",
	})
}

// resolveRef defaults an empty ?ref= query param to the repo's default
// branch — every browse endpoint below shares this so a caller (the file
// tree screen, on first load) doesn't need to already know the default
// branch name before it can ask for anything.
func resolveRef(repoPath, ref string) (string, error) {
	if ref != "" {
		return ref, nil
	}
	def, err := browse.DefaultBranch(repoPath)
	if err != nil {
		return "", err
	}
	if def == "" {
		return "", fmt.Errorf("repository has no commits yet")
	}
	return def, nil
}

func branchesHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	path, _ := repos.Path(claims.TenantID, repoName)
	branches, err := browse.Branches(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(branches)
}

func tagsHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	path, _ := repos.Path(claims.TenantID, repoName)
	tags, err := browse.Tags(path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(tags)
}

func treeHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	repoPath, _ := repos.Path(claims.TenantID, repoName)
	ref, err := resolveRef(repoPath, r.URL.Query().Get("ref"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	entries, err := browse.Tree(repoPath, ref, r.URL.Query().Get("path"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ref": ref, "entries": entries})
}

func blobHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	repoPath, _ := repos.Path(claims.TenantID, repoName)
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	ref, err := resolveRef(repoPath, r.URL.Query().Get("ref"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	content, err := browse.Blob(repoPath, ref, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"ref": ref, "path": path, "content": content})
}

func blameHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	repoPath, _ := repos.Path(claims.TenantID, repoName)
	path := r.URL.Query().Get("path")
	if path == "" {
		http.Error(w, "path is required", http.StatusBadRequest)
		return
	}
	ref, err := resolveRef(repoPath, r.URL.Query().Get("ref"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	lines, err := browse.Blame(repoPath, ref, path)
	if err != nil {
		http.Error(w, err.Error(), http.StatusNotFound)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"ref": ref, "path": path, "lines": lines})
}

// searchMatch/codeSearchHandler implement §11.3 "Cross-repo code search"
// — every browse endpoint above is scoped to one repo the caller already
// named; this is the first endpoint that fans out across every repo a
// tenant owns. Reuses the same real `git grep` approach secretscan
// already established, just with a caller-supplied query instead of a
// fixed rule set, and no persistence — this is a live query, not a scan
// whose results get stored.
type searchMatch struct {
	RepoName   string `json:"repoName"`
	FilePath   string `json:"filePath"`
	LineNumber int    `json:"lineNumber"`
	Line       string `json:"line"`
}

func codeSearchHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	query := r.URL.Query().Get("q")
	if strings.TrimSpace(query) == "" {
		http.Error(w, "q is required", http.StatusBadRequest)
		return
	}
	repoNames, err := repos.List(claims.TenantID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	var matches []searchMatch
	for _, repoName := range repoNames {
		repoPath, err := repos.Path(claims.TenantID, repoName)
		if err != nil {
			continue
		}
		ref, err := resolveRef(repoPath, "")
		if err != nil {
			continue // empty repo — nothing to grep
		}
		cmd := exec.Command("git", "--git-dir", repoPath, "grep", "-In", "-F", "-e", query, ref)
		out, err := cmd.Output()
		if err != nil {
			continue // exit 1 = no matches in this repo, not a real error
		}
		for _, line := range strings.Split(strings.TrimSpace(string(out)), "\n") {
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, ":", 4)
			if len(parts) < 4 {
				continue
			}
			lineNum, convErr := strconv.Atoi(parts[2])
			if convErr != nil {
				continue
			}
			matches = append(matches, searchMatch{RepoName: repoName, FilePath: parts[1], LineNumber: lineNum, Line: parts[3]})
		}
	}
	if matches == nil {
		matches = []searchMatch{}
	}
	writeJSON(w, http.StatusOK, matches)
}

func commitsHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	repoPath, _ := repos.Path(claims.TenantID, repoName)
	ref, err := resolveRef(repoPath, r.URL.Query().Get("ref"))
	if err != nil {
		http.Error(w, err.Error(), http.StatusUnprocessableEntity)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	commits, err := browse.CommitLog(repoPath, ref, r.URL.Query().Get("path"), limit)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(commits)
}

// statusRecorder wraps a ResponseWriter just to observe the status code
// gitcgi.Serve writes — Serve streams git-http-backend's CGI response
// straight through, so this is the only way to learn afterward whether a
// push actually succeeded before triggering a scan off the back of it.
type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

func gitSmartHTTPHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	m := repoPathRE.FindStringSubmatch(r.URL.Path)
	if m == nil {
		http.NotFound(w, r)
		return
	}
	repoName := m[1]
	if !repos.Exists(claims.TenantID, repoName) {
		http.NotFound(w, r)
		return
	}
	// GIT_PROJECT_ROOT is the tenant's repo directory so PATH_INFO can address
	// "/{repoName}.git/..." exactly as git-http-backend expects.
	tenantRoot := repos.Root() + "/" + claims.TenantID
	isPush := strings.Contains(r.URL.Path, "git-receive-pack")
	rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
	gitcgi.Serve(rec, r, tenantRoot, r.URL.Path)

	// Secret scan runs after the push response has already been sent to
	// the client — scanning shouldn't add latency to `git push` itself,
	// same "don't block the caller on best-effort follow-up work"
	// reasoning as runner.service.ts's ci_minutes metering call.
	if isPush && rec.status < 400 {
		repoPath, err := repos.Path(claims.TenantID, repoName)
		if err == nil {
			go scanAndPersist(claims.TenantID, repoName, repoPath)
		}
	}
}

// scanAndPersist scans the repo's default branch (see secretscan's
// docblock for why "on push" here means "the branch's current tree at
// push time", not a diff-only scan) and refreshes that branch's findings
// — deleted, then reinserted, so a secret that's since been removed from
// the tree stops showing up instead of accumulating forever.
func scanAndPersist(tenantID, repoName, repoPath string) {
	branch, err := browse.DefaultBranch(repoPath)
	if err != nil || branch == "" {
		return
	}
	// Fetched once, reused for both the security-findings commit-SHA
	// attribution below AND the Development Panel commit-ticket-link scan —
	// one `git log`, not two, since both need the same recent-commits window.
	commits, err := browse.CommitLog(repoPath, branch, "", 50)
	if err != nil || len(commits) == 0 {
		return
	}
	commitSHA := commits[0].SHA

	// §13.5 Development Panel — best-effort, same fire-and-forget stance as
	// the secret scan itself: a failure here must never fail the push or
	// block the security scan that follows it.
	if err := devpanel.RecordCommitLinks(context.Background(), tenantID, repoName, commits); err != nil {
		log.Printf("dev panel commit-link scan failed for %s/%s: %v", tenantID, repoName, err)
	}

	findings, err := secretscan.Scan(repoPath, branch)
	if err != nil {
		log.Printf("secret scan failed for %s/%s: %v", tenantID, repoName, err)
		return
	}

	err = db.WithTenant(context.Background(), tenantID, func(tx *sql.Tx) error {
		if _, err := tx.Exec(
			`delete from security_findings where tenant_id = $1 and repo_name = $2 and branch = $3`,
			tenantID, repoName, branch,
		); err != nil {
			return err
		}
		for _, f := range findings {
			if _, err := tx.Exec(
				`insert into security_findings (tenant_id, repo_name, branch, commit_sha, file_path, line_number, rule_name, redacted_snippet)
				 values ($1, $2, $3, $4, $5, $6, $7, $8)`,
				tenantID, repoName, branch, commitSHA, f.FilePath, f.Line, f.RuleName, f.Snippet,
			); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		log.Printf("failed to persist security findings for %s/%s: %v", tenantID, repoName, err)
	}
}

type securityFinding struct {
	ID              string `json:"id"`
	Branch          string `json:"branch"`
	CommitSHA       string `json:"commitSha"`
	FilePath        string `json:"filePath"`
	LineNumber      int    `json:"lineNumber"`
	RuleName        string `json:"ruleName"`
	RedactedSnippet string `json:"redactedSnippet"`
	CreatedAt       string `json:"createdAt"`
}

func securityFindingsHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	var findings []securityFinding
	err := db.WithTenant(r.Context(), claims.TenantID, func(tx *sql.Tx) error {
		rows, err := tx.Query(
			`select id, branch, commit_sha, file_path, line_number, rule_name, redacted_snippet, created_at
			 from security_findings where tenant_id = $1 and repo_name = $2
			 order by created_at desc`,
			claims.TenantID, repoName,
		)
		if err != nil {
			return err
		}
		defer rows.Close()
		for rows.Next() {
			var f securityFinding
			if err := rows.Scan(&f.ID, &f.Branch, &f.CommitSHA, &f.FilePath, &f.LineNumber, &f.RuleName, &f.RedactedSnippet, &f.CreatedAt); err != nil {
				return err
			}
			findings = append(findings, f)
		}
		return rows.Err()
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	if findings == nil {
		findings = []securityFinding{}
	}
	writeJSON(w, http.StatusOK, findings)
}

func main() {
	if root := repos.Root(); root != "" {
		os.MkdirAll(root, 0o755)
	}

	if err := db.RunMigrationsAndConnect(); err != nil {
		log.Fatalf("git-host: database setup failed: %v", err)
	}

	mux := http.NewServeMux()
	// Standardized health/readiness endpoint (docs/FEATURES.md §11.10),
	// same shape as every NestJS service's new GET /health — deliberately
	// unauthenticated (no withAuth wrapper) and requires a real `select 1`
	// round trip against Postgres, not just "the process accepted the
	// connection". Registered before /api/repos like every other specific
	// route, ahead of the smart-HTTP catch-all.
	mux.HandleFunc("GET /health", healthHandler)
	mux.HandleFunc("/api/repos", withAuth(reposHandler))

	// PR / branch-protection routes use Go 1.22's method+pattern ServeMux
	// syntax ("POST /path/{param}") — no separate router dependency needed
	// for a route set this size.
	mux.HandleFunc("POST /api/repos/{repo}/pulls", withAuth(createPullRequestHandler))
	mux.HandleFunc("GET /api/repos/{repo}/pulls", withAuth(listPullRequestsHandler))
	mux.HandleFunc("POST /api/repos/{repo}/pulls/{id}/merge", withAuth(mergePullRequestHandler))
	mux.HandleFunc("POST /api/repos/{repo}/pulls/{id}/ready", withAuth(markPullRequestReadyHandler))
	mux.HandleFunc("POST /api/repos/{repo}/pulls/{id}/reviews", withAuth(submitReviewHandler))
	mux.HandleFunc("POST /api/repos/{repo}/pulls/{id}/comments", withAuth(addCommentHandler))
	mux.HandleFunc("GET /api/repos/{repo}/pulls/{id}/review", withAuth(reviewHandler))
	mux.HandleFunc("GET /api/repos/{repo}/pulls/{id}/suggested-reviewers", withAuth(suggestReviewersHandler))
	mux.HandleFunc("POST /api/repos/{repo}/branch-protection", withAuth(upsertBranchProtectionHandler))
	mux.HandleFunc("GET /api/repos/{repo}/branch-protection", withAuth(listBranchProtectionHandler))
	// Branch-level RBAC beyond CODEOWNERS (§11.1) — see allowlist.go's docblock.
	mux.HandleFunc("POST /api/repos/{repo}/branch-allowlist", withAuth(addBranchAllowlistHandler))
	mux.HandleFunc("GET /api/repos/{repo}/branch-allowlist", withAuth(listBranchAllowlistHandler))
	mux.HandleFunc("DELETE /api/branch-allowlist/{id}", withAuth(removeBranchAllowlistHandler))
	mux.HandleFunc("GET /api/repos/{repo}/security-findings", withAuth(securityFindingsHandler))

	// Code-browsing endpoints — read-only `git` plumbing against the bare
	// repo, see internal/browse's docblock. Registered before the
	// smart-HTTP catch-all like every other specific route.
	mux.HandleFunc("GET /api/repos/{repo}/branches", withAuth(branchesHandler))
	mux.HandleFunc("GET /api/repos/{repo}/tags", withAuth(tagsHandler))
	mux.HandleFunc("GET /api/repos/{repo}/tree", withAuth(treeHandler))
	mux.HandleFunc("GET /api/repos/{repo}/blob", withAuth(blobHandler))
	mux.HandleFunc("GET /api/repos/{repo}/commits", withAuth(commitsHandler))
	mux.HandleFunc("GET /api/repos/{repo}/blame", withAuth(blameHandler))

	// Fans out across every repo the tenant owns — a tenant-wide path,
	// not under /api/repos/{repo}, since it isn't scoped to one repo the
	// caller already knows.
	mux.HandleFunc("GET /api/code-search", withAuth(codeSearchHandler))

	// §13.5 Development Panel — same tenant-wide shape as code-search
	// above: a ticket's linked commits/PRs can span any repo, not one the
	// caller already has in scope.
	mux.HandleFunc("GET /api/dev-panel/{ticketKey}", withAuth(devPanelHandler))

	// Smart-HTTP git protocol (push/pull/clone) stays on the catch-all,
	// registered last so it doesn't shadow the more specific patterns above.
	mux.HandleFunc("/", withAuth(gitSmartHTTPHandler))

	port := os.Getenv("PORT")
	if port == "" {
		port = "4003"
	}
	log.Printf("[git-host] listening on :%s (repos root: %s)", port, repos.Root())
	// withCORS wraps the whole mux rather than each route individually —
	// this is also what makes CORS preflight (an OPTIONS request with no
	// Authorization header, since the browser sends it before the real
	// request) work at all: it's answered here, before mux routing would
	// otherwise send it into withAuth and 401 it.
	log.Fatal(http.ListenAndServe(":"+port, withCORS(mux.ServeHTTP)))
}
