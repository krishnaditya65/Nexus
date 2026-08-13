// Test coverage fast-follow (docs/FEATURES.md) — db was one of the
// thinnest packages (mostly schema DDL and real Postgres connections),
// but isValidTenantID is pure and is the one guard standing between
// WithTenant's SET LOCAL string interpolation and a SQL injection —
// worth pinning down directly, no database connection needed.
package db

import "testing"

func TestIsValidTenantID_acceptsRealUUID(t *testing.T) {
	valid := []string{
		"550e8400-e29b-41d4-a716-446655440000",
		"00000000-0000-0000-0000-000000000000",
		"ffffffff-ffff-ffff-ffff-ffffffffffff",
	}
	for _, id := range valid {
		if !isValidTenantID(id) {
			t.Errorf("isValidTenantID(%q) = false, want true", id)
		}
	}
}

func TestIsValidTenantID_rejectsUppercase(t *testing.T) {
	// Postgres UUIDs from this platform's services are always lowercase
	// (gen_random_uuid()'s output) — an uppercase string is either a
	// different format or an attempted bypass, either way not trusted.
	if isValidTenantID("550E8400-E29B-41D4-A716-446655440000") {
		t.Error("isValidTenantID(uppercase) = true, want false")
	}
}

func TestIsValidTenantID_rejectsSQLInjectionAttempt(t *testing.T) {
	malicious := []string{
		"'; drop table pull_requests; --",
		"x' OR '1'='1",
		"550e8400-e29b-41d4-a716-446655440000'; select 1; --",
	}
	for _, id := range malicious {
		if isValidTenantID(id) {
			t.Errorf("isValidTenantID(%q) = true, want false (this is the SQL-injection guard)", id)
		}
	}
}

func TestIsValidTenantID_rejectsMalformedUUIDs(t *testing.T) {
	invalid := []string{"", "not-a-uuid", "550e8400-e29b-41d4-a716", "550e8400e29b41d4a716446655440000"}
	for _, id := range invalid {
		if isValidTenantID(id) {
			t.Errorf("isValidTenantID(%q) = true, want false", id)
		}
	}
}
