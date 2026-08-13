// Test coverage fast-follow (docs/FEATURES.md) — gitcgi's Serve() is a
// real CGI subprocess relay with no pure logic to extract, but PathInfo
// is already a pure, exported string-manipulation function that was
// simply never tested.
package gitcgi

import "testing"

func TestPathInfo_stripsRepoDirPrefix(t *testing.T) {
	got := PathInfo("/tenant-1/myrepo.git", "/tenant-1/myrepo.git/info/refs")
	want := "/info/refs"
	if got != want {
		t.Fatalf("PathInfo() = %q, want %q", got, want)
	}
}

func TestPathInfo_handlesRootPath(t *testing.T) {
	got := PathInfo("/tenant-1/myrepo.git", "/tenant-1/myrepo.git")
	want := "/"
	if got != want {
		t.Fatalf("PathInfo() = %q, want %q", got, want)
	}
}

func TestPathInfo_handlesUploadPackPath(t *testing.T) {
	got := PathInfo("/tenant-1/myrepo.git", "/tenant-1/myrepo.git/git-upload-pack")
	want := "/git-upload-pack"
	if got != want {
		t.Fatalf("PathInfo() = %q, want %q", got, want)
	}
}
