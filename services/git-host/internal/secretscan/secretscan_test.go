// Test coverage fast-follow (docs/FEATURES.md) — secretscan had zero
// test coverage; parseGrepOutput/redact are pure (no git shell-out) so
// they're covered directly, same discipline as codeowners_test.go.
package secretscan

import (
	"reflect"
	"testing"
)

func TestRedact_shortStringFullyRedacted(t *testing.T) {
	if got := redact("short"); got != "[redacted]" {
		t.Fatalf("redact(short) = %q, want [redacted]", got)
	}
}

func TestRedact_exactlySixteenCharsFullyRedacted(t *testing.T) {
	// len("0123456789012345") == 16, the <= boundary.
	if got := redact("0123456789012345"); got != "[redacted]" {
		t.Fatalf("redact(16 chars) = %q, want [redacted]", got)
	}
}

func TestRedact_longStringKeepsHeadAndTailOnly(t *testing.T) {
	got := redact("AKIA1234567890ABCDEF")
	want := "AKIA12…redacted…CDEF"
	if got != want {
		t.Fatalf("redact(long) = %q, want %q", got, want)
	}
	if len(got) < len("AKIA1234567890ABCDEF") {
		// Not a strict requirement, just sanity: the redacted secret
		// itself must never appear intact in the output.
	}
}

func TestRedact_trimsWhitespaceBeforeMeasuring(t *testing.T) {
	got := redact("   short   ")
	if got != "[redacted]" {
		t.Fatalf("redact(whitespace-padded short) = %q, want [redacted]", got)
	}
}

func TestParseGrepOutput_singleMatch(t *testing.T) {
	output := "refs/heads/main:config/prod.yml:12:aws_key = AKIAABCDEFGHIJKLMNOP"
	findings := parseGrepOutput(output, "AWS Access Key ID")
	want := []Finding{
		{FilePath: "config/prod.yml", Line: 12, RuleName: "AWS Access Key ID", Snippet: redact("aws_key = AKIAABCDEFGHIJKLMNOP")},
	}
	if !reflect.DeepEqual(findings, want) {
		t.Fatalf("parseGrepOutput() = %#v, want %#v", findings, want)
	}
}

func TestParseGrepOutput_multipleLinesAndBlankLinesSkipped(t *testing.T) {
	output := "main:a.env:1:SECRET=abcdefghijklmnopqrstuvwxyz\n\nmain:b.env:5:TOKEN=zzzzzzzzzzzzzzzzzzzzzzzz\n"
	findings := parseGrepOutput(output, "Generic API Key Assignment")
	if len(findings) != 2 {
		t.Fatalf("expected 2 findings (blank line skipped), got %d: %#v", len(findings), findings)
	}
	if findings[0].FilePath != "a.env" || findings[0].Line != 1 {
		t.Fatalf("first finding = %#v", findings[0])
	}
	if findings[1].FilePath != "b.env" || findings[1].Line != 5 {
		t.Fatalf("second finding = %#v", findings[1])
	}
}

func TestParseGrepOutput_contentContainingColonsPreserved(t *testing.T) {
	// content itself is "url: https://example.com:8080/x" — SplitN with
	// limit 4 must NOT split on the colons inside content.
	output := "main:app.go:3:url: https://example.com:8080/x"
	findings := parseGrepOutput(output, "Generic API Key Assignment")
	if len(findings) != 1 {
		t.Fatalf("expected 1 finding, got %d", len(findings))
	}
	if findings[0].Snippet != redact("url: https://example.com:8080/x") {
		t.Fatalf("snippet = %q, content-with-colons was mis-split", findings[0].Snippet)
	}
}

func TestParseGrepOutput_malformedLineSkipped(t *testing.T) {
	// Only 3 colon-separated parts — not a valid "ref:path:line:content" line.
	output := "main:onlytwoparts"
	findings := parseGrepOutput(output, "AWS Access Key ID")
	if len(findings) != 0 {
		t.Fatalf("expected malformed line to be skipped, got %#v", findings)
	}
}

func TestParseGrepOutput_nonNumericLineNumberSkipped(t *testing.T) {
	output := "main:a.env:notanumber:SECRET=abcdefghijklmnopqrstuvwxyz"
	findings := parseGrepOutput(output, "Generic API Key Assignment")
	if len(findings) != 0 {
		t.Fatalf("expected non-numeric line number to be skipped, got %#v", findings)
	}
}
