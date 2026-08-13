package main

import (
	"net/http"

	"github.com/nexus/git-host/internal/auth"
	"github.com/nexus/git-host/internal/devpanel"
)

// §13.5 Development Panel — the ticket detail page's "Development" section
// calls this directly from apps/web (cross-service, same as any other
// pm<->git-host call in this platform). An unknown ticket key returns two
// empty arrays, not a 404 — see devpanel.DevPanel's docblock for why.
func devPanelHandler(w http.ResponseWriter, r *http.Request, claims *auth.Claims) {
	ticketKey := r.PathValue("ticketKey")
	commits, prs, err := devpanel.DevPanel(r.Context(), claims.TenantID, ticketKey)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	writeJSON(w, http.StatusOK, map[string]interface{}{
		"ticketKey":    ticketKey,
		"commits":      commits,
		"pullRequests": prs,
	})
}
