// Mirrors the server-side contract documented in docs/ARCHITECTURE.md's
// "Subdomain-based tenant routing" section: the leftmost label of the
// hostname is the tenant slug. Returns null for hosts that aren't a real
// subdomain of a base domain — localhost, bare IPs, or a bare base domain
// with no subdomain at all — so local dev (which has no subdomains) can
// fall back to asking the visitor for their workspace slug directly
// instead of misreading "localhost" itself as a tenant slug.
export function extractTenantSlugFromHost(hostname: string): string | null {
  const host = hostname.split(':')[0]; // strip a port, if present
  if (host === 'localhost' || /^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return null;

  const labels = host.split('.');
  // A bare base domain (e.g. "nexus.app") has 2 labels; a subdomain of it
  // (e.g. "acme.nexus.app") has 3+. Anything with fewer than 3 has no
  // tenant subdomain to extract.
  if (labels.length < 3) return null;

  return labels[0];
}
