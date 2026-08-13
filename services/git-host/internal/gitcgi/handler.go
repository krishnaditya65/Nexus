// Package gitcgi shells out to `git http-backend`, the same CGI program the
// real git-over-HTTP protocol is built on (this is how GitLab/Gitea's own
// smart-HTTP layer works under the hood) — rather than reimplementing the
// pack-protocol wire format by hand.
package gitcgi

import (
	"bufio"
	"io"
	"log"
	"net/http"
	"os/exec"
	"strconv"
	"strings"
)

// Serve runs git-http-backend as a CGI process for a single request against
// repoPath, and streams its CGI-style response back onto w.
func Serve(w http.ResponseWriter, r *http.Request, repoPath, pathInfo string) {
	cmd := exec.Command("git", "http-backend")
	cmd.Env = append(cmd.Env,
		"GIT_PROJECT_ROOT="+repoPath,
		"GIT_HTTP_EXPORT_ALL=1",
		"PATH_INFO="+pathInfo,
		"REQUEST_METHOD="+r.Method,
		"QUERY_STRING="+r.URL.RawQuery,
		"CONTENT_TYPE="+r.Header.Get("Content-Type"),
		"REMOTE_USER=", // auth already enforced upstream by our JWT middleware
	)

	stdin, err := cmd.StdinPipe()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		http.Error(w, "internal error", http.StatusInternalServerError)
		return
	}

	if err := cmd.Start(); err != nil {
		http.Error(w, "git http-backend not available", http.StatusInternalServerError)
		return
	}

	go func() {
		defer stdin.Close()
		io.Copy(stdin, r.Body)
	}()

	reader := bufio.NewReader(stdout)
	// CGI response: headers until a blank line, then raw body.
	headers := http.Header{}
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			http.Error(w, "malformed CGI response", http.StatusBadGateway)
			cmd.Wait()
			return
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			break
		}
		parts := strings.SplitN(line, ":", 2)
		if len(parts) == 2 {
			headers.Add(strings.TrimSpace(parts[0]), strings.TrimSpace(parts[1]))
		}
	}

	status := http.StatusOK
	if s := headers.Get("Status"); s != "" {
		if code, convErr := strconv.Atoi(strings.Fields(s)[0]); convErr == nil {
			status = code
		}
		headers.Del("Status")
	}
	for k, vs := range headers {
		for _, v := range vs {
			w.Header().Add(k, v)
		}
	}
	w.WriteHeader(status)
	if _, err := io.Copy(w, reader); err != nil {
		log.Printf("git-http-backend stream copy error: %v", err)
	}

	if err := cmd.Wait(); err != nil {
		log.Printf("git http-backend exited with error: %v", err)
	}
}

// PathInfo splits "/{tenantId}/{repo}.git/info/refs" style URLs into the
// repo directory portion and the PATH_INFO git-http-backend expects
// (relative to GIT_PROJECT_ROOT, e.g. "/repo.git/info/refs").
func PathInfo(repoDir, fullPath string) string {
	return "/" + strings.TrimPrefix(strings.TrimPrefix(fullPath, repoDir), "/")
}
