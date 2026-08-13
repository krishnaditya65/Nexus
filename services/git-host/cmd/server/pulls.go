package main

import (
	"encoding/json"
	"log"
	"net/http"

	"github.com/nexus/git-host/internal/auth"
	"github.com/nexus/git-host/internal/branchprotection"
	"github.com/nexus/git-host/internal/devpanel"
	"github.com/nexus/git-host/internal/pullrequests"
)

// writeJSON is a small shared helper so every handler in this file returns
// consistently-shaped responses without repeating the header/encode pair.
func writeJSON(w http.ResponseWriter, status int, body interface{}) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	json.NewEncoder(w).Encode(body)
}

func createPullRequestHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	var body struct {
		Title        string `json:"title"`
		Description  string `json:"description"`
		SourceBranch string `json:"sourceBranch"`
		TargetBranch string `json:"targetBranch"`
		IsDraft      bool   `json:"isDraft"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	pr, err := pullrequests.Create(r.Context(), claims.TenantID, repoName, body.Title, body.Description, body.SourceBranch, body.TargetBranch, claims.Sub, body.IsDraft)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	// §13.5 Development Panel — best-effort, mirrors scanAndPersist's stance
	// on the security scan: a link-scan failure must never fail PR creation.
	if err := devpanel.RecordPRLink(r.Context(), claims.TenantID, repoName, pr.ID, pr.Title); err != nil {
		log.Printf("dev panel PR-link scan failed for %s/%s PR %s: %v", claims.TenantID, repoName, pr.ID, err)
	}
	writeJSON(w, http.StatusCreated, pr)
}

func listPullRequestsHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	prs, err := pullrequests.List(r.Context(), claims.TenantID, repoName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, prs)
}

func submitReviewHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	prID := r.PathValue("id")
	var body struct {
		Status string `json:"status"` // 'approved' | 'changes_requested'
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := pullrequests.SubmitReview(r.Context(), claims.TenantID, prID, claims.Sub, body.Status); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "recorded"})
}

func addCommentHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	prID := r.PathValue("id")
	var body struct {
		Body       string `json:"body"`
		FilePath   string `json:"filePath"`
		LineNumber *int   `json:"lineNumber"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	if err := pullrequests.AddComment(r.Context(), claims.TenantID, prID, claims.Sub, body.Body, body.FilePath, body.LineNumber); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"status": "commented"})
}

func mergePullRequestHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	prID := r.PathValue("id")
	var body struct {
		Strategy string `json:"strategy"`
	}
	_ = json.NewDecoder(r.Body).Decode(&body) // empty body is fine — defaults to "merge" inside Merge()
	result, err := pullrequests.Merge(r.Context(), claims.TenantID, repoName, prID, body.Strategy, claims.Sub)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	status := http.StatusOK
	if !result.Merged {
		status = http.StatusConflict
	}
	writeJSON(w, status, result)
}

// reviewHandler — §11.8 "AI PR review assistant": a real `git diff
// --numstat` between the PR's two real branches, summarized with a few
// deterministic, explainable heuristics. See pullrequests.GenerateReview's
// docblock for why this isn't an LLM call.
func reviewHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	prID := r.PathValue("id")
	review, err := pullrequests.GenerateReview(r.Context(), claims.TenantID, prID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, review)
}

// suggestReviewersHandler — §11.8 "git-blame-informed assignee
// suggestion": ranks candidate reviewers by real blame ownership of the
// PR's touched files on the target branch. See
// pullrequests.SuggestReviewers's docblock.
func suggestReviewersHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	prID := r.PathValue("id")
	suggestions, err := pullrequests.SuggestReviewers(r.Context(), claims.TenantID, prID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, suggestions)
}

func markPullRequestReadyHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	prID := r.PathValue("id")
	if err := pullrequests.MarkReady(r.Context(), claims.TenantID, prID); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ready"})
}

func listBranchProtectionHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	rules, err := branchprotection.List(r.Context(), claims.TenantID, repoName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, rules)
}

func upsertBranchProtectionHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	var body struct {
		BranchPattern          string `json:"branchPattern"`
		RequireReviewsCount    int    `json:"requireReviewsCount"`
		RequireCodeownerReview bool   `json:"requireCodeownerReview"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	rule, err := branchprotection.Upsert(r.Context(), claims.TenantID, repoName, body.BranchPattern, body.RequireReviewsCount, body.RequireCodeownerReview)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, rule)
}

// Branch-level RBAC beyond CODEOWNERS (docs/FEATURES.md §11.1) — see
// branchprotection/allowlist.go's docblock and pullrequests.Merge's
// enforcement point.

func listBranchAllowlistHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	entries, err := branchprotection.ListAllowlist(r.Context(), claims.TenantID, repoName)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, entries)
}

func addBranchAllowlistHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	repoName := r.PathValue("repo")
	var body struct {
		BranchPattern string `json:"branchPattern"`
		UserID        string `json:"userId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, "invalid body", http.StatusBadRequest)
		return
	}
	entry, err := branchprotection.AddAllowlistEntry(r.Context(), claims.TenantID, repoName, body.BranchPattern, body.UserID)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, entry)
}

func removeBranchAllowlistHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	entryID := r.PathValue("id")
	if err := branchprotection.RemoveAllowlistEntry(r.Context(), claims.TenantID, entryID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "removed"})
}
