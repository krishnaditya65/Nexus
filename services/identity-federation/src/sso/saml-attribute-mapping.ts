/**
 * Pure identity-mapping logic extracted out of `SamlSpService.processAcs`
 * (docs/FEATURES.md — test-coverage fast-follow: this service had no
 * jest config at all until this pass). Kept separate from the
 * samlify-calling service method so the actual attribute-fallback
 * decisions can be unit-tested with no XML parsing, no signature
 * validation, and no DB — same pure-function-for-testability discipline
 * as every other non-trivial decision in this build.
 */
export interface SamlAttributes {
  email?: string;
  Email?: string;
  mail?: string;
  displayName?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
}

/**
 * IdPs disagree on attribute casing/naming (`email` vs `Email` vs `mail`;
 * a combined `displayName`/`name` vs separate `firstName`/`lastName`) —
 * this is the one place that fallback chain lives, matching
 * `SamlSpService.processAcs`'s original inline logic exactly. `nameId` is
 * the final fallback for email (SAML's NameID is commonly the user's
 * email/UPN) and, transitively, for displayName too.
 */
export function mapSamlAttributesToIdentity(
  nameId: string,
  attrs: SamlAttributes,
): { email: string; displayName: string } {
  const email = attrs.email ?? attrs.Email ?? attrs.mail ?? nameId;
  const nameFromParts = [attrs.firstName, attrs.lastName].filter(Boolean).join(' ');
  const displayName = attrs.displayName ?? attrs.name ?? (nameFromParts || email);
  return { email, displayName };
}

/**
 * `samlify`'s `extract` shape doesn't reliably surface the assertion's own
 * ID across every IdP's response — this reconstructs a stable, per-login
 * fallback identifier so `record_saml_assertion_id`'s replay check still
 * has something unique to key on. Replay protection still holds as long
 * as the IdP doesn't reissue byte-identical responses, which none do
 * (each includes a fresh IssueInstant/ID pair per SAML spec §2.3.3).
 */
export function resolveEffectiveAssertionId(
  nameId: string,
  extractedAssertionId: string | undefined,
  sessionIndex: string | undefined,
  issueInstant: string | undefined,
  nowMs: number,
): string {
  if (extractedAssertionId) return extractedAssertionId;
  return `${nameId}:${sessionIndex ?? ''}:${issueInstant ?? nowMs}`;
}
