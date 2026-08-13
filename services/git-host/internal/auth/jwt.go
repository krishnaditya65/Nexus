// Package auth verifies RS256 JWTs issued by services/auth, fetched live
// from its JWKS endpoint — so a single login session works across ticketing
// and Git hosting. Extraction of tenant_id from the verified claims is what
// scopes every repo path below — no request can address a repo outside its
// own tenant's directory tree.
//
// This used to verify against a shared HS256 secret (matching every other
// service's pre-Phase-3 JwtStrategy). When auth-service migrated to RS256 +
// JWKS (see docs/ROADMAP.md), every NestJS verify-only service was updated
// via jwks-rsa — this Go service was missed in that pass and was left
// silently broken (rejecting every real token auth-service issues) until
// caught while building git-host's first UI screens. Fixed the same way
// the NestJS services were: fetch and cache the issuer's public JWKS,
// verify against the key matching the token's `kid`, never hold a secret.
package auth

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/MicahParks/keyfunc/v3"
	"github.com/golang-jwt/jwt/v5"
)

type Claims struct {
	Sub      string `json:"sub"`
	TenantID string `json:"tenant_id"`
	Role     string `json:"role"`
	Email    string `json:"email"`
	jwt.RegisteredClaims
}

var (
	keyfuncOnce sync.Once
	cachedKF    keyfunc.Keyfunc
	kfInitErr   error
)

func authServiceURL() string {
	url := os.Getenv("AUTH_SERVICE_URL")
	if url == "" {
		url = "http://localhost:4001"
	}
	return url
}

// jwksKeyfunc lazily fetches auth-service's JWKS on first use and caches
// the resulting Keyfunc for the life of the process — keyfunc itself
// handles background refresh/re-fetch on a `kid` cache miss, the same
// caching behavior jwks-rsa gives the NestJS services.
func jwksKeyfunc() (keyfunc.Keyfunc, error) {
	keyfuncOnce.Do(func() {
		jwksURL := authServiceURL() + "/.well-known/jwks.json"
		cachedKF, kfInitErr = keyfunc.NewDefaultCtx(context.Background(), []string{jwksURL})
	})
	return cachedKF, kfInitErr
}

// bearerToken pulls the raw token string out of an "Authorization:
// Bearer <token>" header value — pure, split out from FromRequest
// specifically so this parsing step is unit-testable without a real
// HTTP request or a real signed JWT (docs/FEATURES.md test-coverage
// fast-follow).
func bearerToken(headerValue string) (string, error) {
	if !strings.HasPrefix(headerValue, "Bearer ") {
		return "", errors.New("missing bearer token")
	}
	return strings.TrimPrefix(headerValue, "Bearer "), nil
}

func FromRequest(r *http.Request) (*Claims, error) {
	tokenStr, err := bearerToken(r.Header.Get("Authorization"))
	if err != nil {
		return nil, err
	}

	kf, err := jwksKeyfunc()
	if err != nil {
		return nil, fmt.Errorf("fetching signing keys: %w", err)
	}

	claims := &Claims{}
	token, err := jwt.ParseWithClaims(tokenStr, claims, kf.Keyfunc, jwt.WithValidMethods([]string{"RS256"}))
	if err != nil || !token.Valid {
		return nil, fmt.Errorf("invalid token: %w", err)
	}
	if claims.TenantID == "" {
		return nil, errors.New("token missing tenant_id claim")
	}
	return claims, nil
}
