// Test coverage fast-follow (docs/FEATURES.md) — repos had zero test
// coverage; ValidName is pure (no filesystem access) and is the one
// thing standing between a repo name and path traversal, so it's the
// highest-value function in this package to pin down with tests.
package repos

import "testing"

func TestValidName(t *testing.T) {
	valid := []string{"my-repo", "my_repo", "MyRepo123", "a", "repo-123_test"}
	for _, name := range valid {
		if !ValidName(name) {
			t.Errorf("ValidName(%q) = false, want true", name)
		}
	}
}

func TestValidName_rejectsPathTraversal(t *testing.T) {
	invalid := []string{"../../etc/passwd", "..", "a/../../b", "repo/../other"}
	for _, name := range invalid {
		if ValidName(name) {
			t.Errorf("ValidName(%q) = true, want false (path traversal must be rejected)", name)
		}
	}
}

func TestValidName_rejectsOtherUnsafeCharacters(t *testing.T) {
	invalid := []string{"repo name", "repo;rm -rf", "repo/slash", "repo.git", "", "repo\x00null"}
	for _, name := range invalid {
		if ValidName(name) {
			t.Errorf("ValidName(%q) = true, want false", name)
		}
	}
}
