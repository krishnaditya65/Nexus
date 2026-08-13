// Pure-JS IPv4 CIDR/exact-IP matching — no external dependency for what's
// a small, self-contained piece of arithmetic. IPv6 addresses are treated
// as always-allowed rather than rejected outright (see matchesAny's
// docblock) — this platform's dev/test traffic is IPv4-only and a false
// "blocked" on IPv6 would be a worse failure mode than under-enforcing it.

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isInteger(n) || n < 0 || n > 255) return null;
    result = (result << 8) | n;
  }
  return result >>> 0;
}

function matchesOne(ip: string, entry: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false; // not an IPv4 address — see matchesAny

  const slash = entry.indexOf('/');
  if (slash === -1) {
    const entryInt = ipv4ToInt(entry.trim());
    return entryInt !== null && entryInt === ipInt;
  }

  const base = ipv4ToInt(entry.slice(0, slash).trim());
  const prefixLen = Number(entry.slice(slash + 1).trim());
  if (base === null || !Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 32) return false;
  const mask = prefixLen === 0 ? 0 : (0xffffffff << (32 - prefixLen)) >>> 0;
  return (ipInt & mask) === (base & mask);
}

/** True if `ip` matches any allowlist entry (bare IP or CIDR). A real
 *  IPv6 address always returns true — fail-open on a format this matcher
 *  can't evaluate, same reasoning as an empty allowlist meaning
 *  unrestricted: this is defense-in-depth, not the platform's only access
 *  boundary, so a matcher gap should never be the thing that locks out a
 *  legitimate caller.
 *
 *  Node's Express commonly reports an IPv4 connection as an IPv4-mapped
 *  IPv6 address ("::ffff:203.0.113.9") rather than the bare IPv4 form —
 *  caught live while verifying this against a real request (a raw
 *  ip.includes(':') check would fail-open on literally every IPv4
 *  request, silently disabling the entire allowlist). Unwrapped to its
 *  IPv4 form before the always-allow check, so only genuine IPv6 traffic
 *  hits the fail-open path. */
export function matchesAny(ip: string, entries: string[]): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const normalized = mapped ? mapped[1] : ip;
  if (normalized.includes(':')) return true; // genuine IPv6 — see docblock
  return entries.some((entry) => matchesOne(normalized, entry));
}
