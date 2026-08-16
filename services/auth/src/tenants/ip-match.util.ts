// Pure-JS IPv4 + IPv6 CIDR/exact-IP matching — no external dependency for
// what's a small, self-contained piece of arithmetic.

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

/** Parses a full IPv6 address (including "::" compression) into 8
 *  16-bit groups, or null if `ip` isn't a valid IPv6 address. No
 *  support for a trailing embedded IPv4 form ("::ffff:1.2.3.4") here —
 *  that's unwrapped to plain IPv4 by matchesAny before this is reached. */
function ipv6ToGroups(ip: string): number[] | null {
  const stripped = ip.replace(/^\[|\]$/g, '');
  if (stripped.includes('.')) return null; // embedded-IPv4 form — not handled here
  const halves = stripped.split('::');
  if (halves.length > 2) return null;

  const parseSide = (side: string): number[] | null => {
    if (side === '') return [];
    const parts = side.split(':');
    const groups: number[] = [];
    for (const part of parts) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(part)) return null;
      groups.push(parseInt(part, 16));
    }
    return groups;
  };

  if (halves.length === 1) {
    const groups = parseSide(halves[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const left = parseSide(halves[0]);
  const right = parseSide(halves[1]);
  if (!left || !right) return null;
  const missing = 8 - left.length - right.length;
  if (missing < 0) return null;
  return [...left, ...new Array(missing).fill(0), ...right];
}

function matchesOneV4(ip: string, entry: string): boolean {
  const ipInt = ipv4ToInt(ip);
  if (ipInt === null) return false;

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

/** Real IPv6 CIDR/exact-IP matching, same shape as matchesOneV4: compares
 *  the address's leading `prefixLen` bits (default /128, i.e. exact
 *  match) against the entry's, group by group, 16 bits at a time. */
function matchesOneV6(ip: string, entry: string): boolean {
  const ipGroups = ipv6ToGroups(ip);
  if (ipGroups === null) return false;

  const slash = entry.indexOf('/');
  const baseStr = (slash === -1 ? entry : entry.slice(0, slash)).trim();
  const prefixLen = slash === -1 ? 128 : Number(entry.slice(slash + 1).trim());
  const baseGroups = ipv6ToGroups(baseStr);
  if (baseGroups === null || !Number.isInteger(prefixLen) || prefixLen < 0 || prefixLen > 128) return false;

  let bitsLeft = prefixLen;
  for (let i = 0; i < 8; i++) {
    const groupBits = Math.min(16, Math.max(0, bitsLeft));
    bitsLeft -= groupBits;
    const mask = groupBits === 0 ? 0 : (0xffff << (16 - groupBits)) & 0xffff;
    if ((ipGroups[i] & mask) !== (baseGroups[i] & mask)) return false;
  }
  return true;
}

function matchesOne(ip: string, entry: string): boolean {
  return ip.includes(':') ? matchesOneV6(ip, entry) : matchesOneV4(ip, entry);
}

/** True if `ip` matches any allowlist entry (bare IP or CIDR), for both
 *  IPv4 and genuine IPv6 addresses.
 *
 *  Node's Express commonly reports an IPv4 connection as an IPv4-mapped
 *  IPv6 address ("::ffff:203.0.113.9") rather than the bare IPv4 form —
 *  caught live while verifying this against a real request (a raw
 *  ip.includes(':') check would treat every IPv4 request as IPv6).
 *  Unwrapped to its IPv4 form first, so only genuine IPv6 traffic is ever
 *  matched against IPv6 entries.
 *
 *  Genuine IPv6 addresses are matched against IPv6 allowlist entries with
 *  the same real CIDR-prefix comparison IPv4 gets — no blanket
 *  always-allow. If the tenant's allowlist has no IPv6 entries at all, an
 *  IPv6 caller is DENIED (not fail-open): entries.some(...) simply finds
 *  no match, same as an IPv4 caller against an allowlist with no IPv4
 *  entries. This is a literal-address/CIDR comparison only, not a DNS- or
 *  proxy-aware check — out of scope, same as elsewhere in this file. */
export function matchesAny(ip: string, entries: string[]): boolean {
  const mapped = ip.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  const normalized = mapped ? mapped[1] : ip;
  return entries.some((entry) => matchesOne(normalized, entry));
}
