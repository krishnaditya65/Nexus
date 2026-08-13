// Test coverage fast-follow (docs/FEATURES.md) — pullrequests' one pure
// nugget (Merge()'s inline strategy validation, previously not
// extracted since everything else in this package is DB/git-shell-out
// dependent) pulled into mergestrategy.go specifically to close this gap.
package pullrequests

import "testing"

func TestNormalizeMergeStrategy_defaultsEmptyToMerge(t *testing.T) {
	got, err := normalizeMergeStrategy("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != "merge" {
		t.Fatalf("normalizeMergeStrategy(\"\") = %q, want \"merge\"", got)
	}
}

func TestNormalizeMergeStrategy_acceptsEveryRealStrategy(t *testing.T) {
	for _, s := range []string{"merge", "squash", "rebase"} {
		got, err := normalizeMergeStrategy(s)
		if err != nil {
			t.Errorf("normalizeMergeStrategy(%q) unexpected error: %v", s, err)
		}
		if got != s {
			t.Errorf("normalizeMergeStrategy(%q) = %q, want unchanged", s, got)
		}
	}
}

func TestNormalizeMergeStrategy_rejectsUnknownStrategy(t *testing.T) {
	_, err := normalizeMergeStrategy("fast-forward-only")
	if err == nil {
		t.Fatal("expected an error for an unknown strategy, got nil")
	}
}
