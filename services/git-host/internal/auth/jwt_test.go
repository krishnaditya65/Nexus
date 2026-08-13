// Test coverage fast-follow (docs/FEATURES.md) — auth's real work
// (JWKS fetch + RS256 signature verification) is inherently network-
// dependent and not unit-testable without a live auth-service or a
// hand-rolled JWKS server; bearerToken is the one pure step pulled out
// specifically so IT can be tested without either.
package auth

import "testing"

func TestBearerToken_extractsTokenFromValidHeader(t *testing.T) {
	got, err := bearerToken("Bearer abc.def.ghi")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "abc.def.ghi" {
		t.Fatalf("bearerToken() = %q, want %q", got, "abc.def.ghi")
	}
}

func TestBearerToken_rejectsMissingHeader(t *testing.T) {
	_, err := bearerToken("")
	if err == nil {
		t.Fatal("expected an error for an empty header, got nil")
	}
}

func TestBearerToken_rejectsWrongScheme(t *testing.T) {
	invalid := []string{"Basic dXNlcjpwYXNz", "abc.def.ghi", "bearer abc.def.ghi"}
	for _, h := range invalid {
		if _, err := bearerToken(h); err == nil {
			t.Errorf("bearerToken(%q) expected an error (wrong/missing scheme), got nil", h)
		}
	}
}

func TestBearerToken_rejectsBearerWithNoToken(t *testing.T) {
	got, err := bearerToken("Bearer ")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "" {
		t.Fatalf("bearerToken(\"Bearer \") = %q, want empty string (caller/JWT parser rejects it downstream)", got)
	}
}
