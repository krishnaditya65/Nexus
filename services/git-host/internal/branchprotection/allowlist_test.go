package branchprotection

import "testing"

func TestIsUserAllowedAmong(t *testing.T) {
	cases := []struct {
		name    string
		entries []AllowlistEntry
		branch  string
		userID  string
		want    bool
	}{
		{
			name:    "no entries at all — fail open",
			entries: nil,
			branch:  "main",
			userID:  "u1",
			want:    true,
		},
		{
			name:    "entries exist but none match this branch — fail open",
			entries: []AllowlistEntry{{BranchPattern: "release/*", UserID: "u1"}},
			branch:  "main",
			userID:  "u2",
			want:    true,
		},
		{
			name:    "matching pattern, user is listed — allowed",
			entries: []AllowlistEntry{{BranchPattern: "main", UserID: "u1"}},
			branch:  "main",
			userID:  "u1",
			want:    true,
		},
		{
			name:    "matching pattern, user is NOT listed — blocked",
			entries: []AllowlistEntry{{BranchPattern: "main", UserID: "u1"}},
			branch:  "main",
			userID:  "u2",
			want:    false,
		},
		{
			name: "glob pattern matches, user listed under that pattern",
			entries: []AllowlistEntry{
				{BranchPattern: "release/*", UserID: "u1"},
			},
			branch: "release/2.0",
			userID: "u1",
			want:   true,
		},
		{
			name: "user listed under a DIFFERENT matching pattern doesn't count",
			entries: []AllowlistEntry{
				{BranchPattern: "release/*", UserID: "u1"},
				{BranchPattern: "hotfix/*", UserID: "u2"},
			},
			branch: "release/2.0",
			userID: "u2",
			want:   false,
		},
	}

	for _, c := range cases {
		t.Run(c.name, func(t *testing.T) {
			got := isUserAllowedAmong(c.entries, c.branch, c.userID)
			if got != c.want {
				t.Errorf("isUserAllowedAmong() = %v, want %v", got, c.want)
			}
		})
	}
}
