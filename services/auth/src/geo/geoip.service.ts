import { Injectable } from '@nestjs/common';

// A handful of well-known, publicly documented IPv4 ranges used for
// this stub's demonstration/test coverage — NOT a real GeoIP database.
// Loopback/private ranges resolve to null ("unknown/local"), never a
// specific country, so local dev and internal health checks are never
// accidentally geo-blocked.
const KNOWN_RANGES: Array<{ prefix: string; country: string }> = [
  { prefix: '203.0.113.', country: 'AU' }, // TEST-NET-3, documentation range
  { prefix: '198.51.100.', country: 'US' }, // TEST-NET-2, documentation range
  { prefix: '192.0.2.', country: 'GB' }, // TEST-NET-1, documentation range
];

/**
 * Geo-based access restriction + impossible-travel anomaly detection
 * (docs/FEATURES.md §11.1) — `resolveCountry` is a REAL, wired interface
 * with an HONESTLY-DISCLOSED stub implementation: a real deployment needs
 * a MaxMind GeoLite2/GeoIP2 database (or a hosted API like ipapi/
 * ipinfo) — no such database ships in this repo, and downloading one
 * requires a MaxMind license key this build has no way to provision. The
 * lookup table above covers only IANA's three documentation/test
 * ranges (TEST-NET-1/2/3), which is enough to unit-test the actual
 * enforcement logic below (isCountryAllowed/isImpossibleTravel — both
 * pure, both independent of this stub) without a real database, but is
 * NOT a working GeoIP resolver for real traffic. Swapping in a real
 * provider means replacing this one method's body; every call site
 * (AuthService.login) is already written against the async interface a
 * real HTTP-calling or mmdb-reading implementation would need.
 */
@Injectable()
export class GeoIpService {
  async resolveCountry(ip: string): Promise<string | null> {
    for (const range of KNOWN_RANGES) {
      if (ip.startsWith(range.prefix)) return range.country;
    }
    return null;
  }
}

/** Pure — a tenant with no configured allowlist (null/empty array) is
 *  unrestricted, same fail-open stance as IP allowlisting. An
 *  unresolvable country (GeoIpService returned null) also fails open —
 *  a lookup miss shouldn't lock every real user out. */
export function isCountryAllowed(country: string | null, allowedCountries: string[] | null | undefined): boolean {
  if (!allowedCountries || allowedCountries.length === 0) return true;
  if (!country) return true;
  return allowedCountries.includes(country);
}

/**
 * Pure — flags a login as impossible-travel when it comes from a
 * DIFFERENT country than the user's last login, within `thresholdMinutes`
 * of it. Deliberately country-level, not lat/lon-based (no geocoordinate
 * data in this build's GeoIP stub) — a coarser, cheaper signal than real
 * distance/speed math, same "honestly-scoped first slice" discipline as
 * every other narrower-than-ideal item in this backlog. A null previous
 * country/timestamp (first-ever login) never flags — there's nothing to
 * compare against yet.
 */
export function isImpossibleTravel(
  previous: { country: string | null; at: Date | null },
  current: { country: string | null; at: Date },
  thresholdMinutes = 120,
): boolean {
  if (!previous.country || !previous.at || !current.country) return false;
  if (previous.country === current.country) return false;
  const minutesElapsed = (current.at.getTime() - previous.at.getTime()) / 60_000;
  return minutesElapsed >= 0 && minutesElapsed < thresholdMinutes;
}
