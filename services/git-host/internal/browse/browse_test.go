// Test coverage fast-follow (docs/FEATURES.md) — browse had zero test
// coverage; isHexPrefix is pure (no git shell-out) and is the guard that
// decides whether a blame line's leading token is a real commit SHA
// versus a continuation line, so it's worth pinning down directly.
package browse

import "testing"

func TestIsHexPrefix_validFortyCharHex(t *testing.T) {
	sha := "abcdef0123456789abcdef0123456789abcdef01"[:40]
	if !isHexPrefix(sha) {
		t.Errorf("isHexPrefix(%q) = false, want true", sha)
	}
}

func TestIsHexPrefix_rejectsUppercase(t *testing.T) {
	sha := "ABCDEF0123456789ABCDEF0123456789ABCDEF01"[:40]
	if isHexPrefix(sha) {
		t.Errorf("isHexPrefix(%q) = true, want false (git SHAs are lowercase hex)", sha)
	}
}

func TestIsHexPrefix_rejectsNonHexCharacter(t *testing.T) {
	sha := "zbcdef0123456789abcdef0123456789abcdef01"[:40]
	if isHexPrefix(sha) {
		t.Errorf("isHexPrefix(%q) = true, want false", sha)
	}
}

func TestIsHexPrefix_onlyChecksFirstFortyCharacters(t *testing.T) {
	// A valid 40-char hex prefix followed by garbage should still report
	// true — callers are expected to have already checked len(s) > 40
	// before calling this (see the one call site in Blame).
	sha := "abcdef0123456789abcdef0123456789abcdef01 this is a commit message"
	if !isHexPrefix(sha) {
		t.Errorf("isHexPrefix(%q) = false, want true (only the first 40 chars matter)", sha)
	}
}
