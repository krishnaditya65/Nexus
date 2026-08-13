package devpanel

import (
	"reflect"
	"testing"
)

// First real test in git-host's own Go test tier (docs/FEATURES.md §11.10
// flags this as "a distinct, not-yet-started follow-up" from the 13-service
// Jest tier — this is that follow-up's opening slice, on the pure function
// this package's whole correlation mechanism hinges on). Extracted-and-
// tested-for-real, same discipline as every Jest unit test elsewhere in
// this build.
func TestExtractTicketKeys(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"single key", "CONN-42 Fix login redirect loop", []string{"CONN-42"}},
		{"key mid-sentence", "Addresses feedback from SEC-7 review", []string{"SEC-7"}},
		{"multiple distinct keys", "CONN-1 and CONN-2 both need this fix", []string{"CONN-1", "CONN-2"}},
		{"duplicate key collapses to one", "CONN-1: retry CONN-1 after review", []string{"CONN-1"}},
		{"no key present", "Refactor the auth middleware", []string{}},
		{"lowercase does not match", "conn-42 is not a real key shape", []string{}},
		{"bare number does not match", "Closes #42", []string{}},
		{"long uppercase run without digits does not match", "ALLCAPSNOISE should not match", []string{}},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := ExtractTicketKeys(c.in)
			if len(got) == 0 {
				got = []string{}
			}
			if !reflect.DeepEqual(got, c.want) {
				t.Errorf("ExtractTicketKeys(%q) = %v, want %v", c.in, got, c.want)
			}
		})
	}
}
