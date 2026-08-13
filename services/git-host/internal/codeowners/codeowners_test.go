// Test coverage fast-follow (docs/FEATURES.md) — codeowners was one of
// git-host's Go packages with zero test coverage; only devpanel and
// branchprotection had tests before this pass. Parse/OwnersFor are pure
// (no git shell-out, no filesystem) so they're covered directly, same
// discipline as branchprotection's allowlist_test.go.
package codeowners

import (
	"reflect"
	"testing"
)

func TestParse(t *testing.T) {
	content := `# top-level fallback
* @platform-team

# frontend
/apps/web @web-team @design-team

  /services/pm  @pm-team

not-a-rule-line
`
	rules := Parse(content)
	want := []Rule{
		{PathPrefix: "*", Owners: []string{"@platform-team"}},
		{PathPrefix: "apps/web", Owners: []string{"@web-team", "@design-team"}},
		{PathPrefix: "services/pm", Owners: []string{"@pm-team"}},
	}
	// "not-a-rule-line" has only one field (no owner), so it's skipped —
	// confirmed implicitly by want having exactly 3 rules.
	if !reflect.DeepEqual(rules, want) {
		t.Fatalf("Parse() = %#v, want %#v", rules, want)
	}
}

func TestParse_emptyAndCommentsOnly(t *testing.T) {
	rules := Parse("\n# just a comment\n\n   \n")
	if len(rules) != 0 {
		t.Fatalf("expected no rules, got %#v", rules)
	}
}

func TestParse_leadingSlashStripped(t *testing.T) {
	rules := Parse("/foo/bar @someone")
	if len(rules) != 1 || rules[0].PathPrefix != "foo/bar" {
		t.Fatalf("expected leading slash stripped, got %#v", rules)
	}
}

func TestOwnersFor_lastMatchWins(t *testing.T) {
	rules := []Rule{
		{PathPrefix: "", Owners: []string{"@platform-team"}},
		{PathPrefix: "services/pm", Owners: []string{"@pm-team"}},
	}
	owners := OwnersFor(rules, []string{"services/pm/src/tickets/tickets.service.ts"})
	want := []string{"@pm-team"}
	if !reflect.DeepEqual(owners, want) {
		t.Fatalf("OwnersFor() = %#v, want %#v (more specific/later rule should win, not the catch-all)", owners, want)
	}
}

func TestOwnersFor_dedupesAcrossFiles(t *testing.T) {
	rules := []Rule{
		{PathPrefix: "services/pm", Owners: []string{"@pm-team"}},
	}
	owners := OwnersFor(rules, []string{
		"services/pm/a.ts",
		"services/pm/b.ts",
	})
	want := []string{"@pm-team"}
	if !reflect.DeepEqual(owners, want) {
		t.Fatalf("OwnersFor() = %#v, want deduplicated %#v", owners, want)
	}
}

func TestOwnersFor_noMatchContributesNothing(t *testing.T) {
	rules := []Rule{
		{PathPrefix: "services/pm", Owners: []string{"@pm-team"}},
	}
	owners := OwnersFor(rules, []string{"services/git-host/main.go"})
	if len(owners) != 0 {
		t.Fatalf("expected no owners for an unmatched file, got %#v", owners)
	}
}

func TestOwnersFor_unionAcrossMultipleFilesDifferentOwners(t *testing.T) {
	rules := []Rule{
		{PathPrefix: "apps/web", Owners: []string{"@web-team"}},
		{PathPrefix: "services/pm", Owners: []string{"@pm-team"}},
	}
	owners := OwnersFor(rules, []string{
		"apps/web/app/page.tsx",
		"services/pm/src/main.ts",
	})
	want := []string{"@web-team", "@pm-team"}
	if !reflect.DeepEqual(owners, want) {
		t.Fatalf("OwnersFor() = %#v, want %#v", owners, want)
	}
}
