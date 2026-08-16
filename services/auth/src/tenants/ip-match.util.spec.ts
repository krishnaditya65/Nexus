import { matchesAny } from './ip-match.util';

describe('matchesAny', () => {
  describe('exact IPv4 matches', () => {
    it('matches an exact IP in the allowlist', () => {
      expect(matchesAny('203.0.113.9', ['203.0.113.9'])).toBe(true);
    });

    it('rejects an IP not in the allowlist', () => {
      expect(matchesAny('203.0.113.10', ['203.0.113.9'])).toBe(false);
    });

    it('tolerates surrounding whitespace on allowlist entries', () => {
      expect(matchesAny('203.0.113.9', [' 203.0.113.9 '])).toBe(true);
    });
  });

  describe('CIDR ranges', () => {
    it('matches an address inside a /24', () => {
      expect(matchesAny('10.0.0.42', ['10.0.0.0/24'])).toBe(true);
    });

    it('rejects an address outside the /24', () => {
      expect(matchesAny('10.0.1.42', ['10.0.0.0/24'])).toBe(false);
    });

    it('matches every address under /0 (the whole IPv4 space)', () => {
      expect(matchesAny('8.8.8.8', ['0.0.0.0/0'])).toBe(true);
    });

    it('matches only the exact address under /32', () => {
      expect(matchesAny('10.0.0.1', ['10.0.0.1/32'])).toBe(true);
      expect(matchesAny('10.0.0.2', ['10.0.0.1/32'])).toBe(false);
    });

    it('rejects a malformed CIDR entry rather than throwing', () => {
      expect(matchesAny('10.0.0.1', ['not-a-cidr/24'])).toBe(false);
      expect(matchesAny('10.0.0.1', ['10.0.0.0/99'])).toBe(false);
    });
  });

  describe('multiple allowlist entries', () => {
    it('matches if any entry matches', () => {
      expect(matchesAny('10.0.0.1', ['192.168.0.0/16', '10.0.0.0/8'])).toBe(true);
    });

    it('rejects if no entry matches', () => {
      expect(matchesAny('172.16.0.1', ['192.168.0.0/16', '10.0.0.0/8'])).toBe(false);
    });

    it('rejects against an empty allowlist (caller decides what empty means — see tenants.service.ts)', () => {
      expect(matchesAny('10.0.0.1', [])).toBe(false);
    });
  });

  describe('IPv6 handling', () => {
    it('denies a genuine IPv6 address against an IPv4-only allowlist (no blanket allow)', () => {
      expect(matchesAny('2001:db8::1', ['10.0.0.0/8'])).toBe(false);
    });

    it('matches a genuine IPv6 address against an IPv6 CIDR entry', () => {
      expect(matchesAny('2001:db8::1', ['2001:db8::/32'])).toBe(true);
      expect(matchesAny('2001:db9::1', ['2001:db8::/32'])).toBe(false);
    });

    it('matches a genuine IPv6 address against an exact IPv6 entry', () => {
      expect(matchesAny('2001:db8::1', ['2001:db8::1'])).toBe(true);
      expect(matchesAny('2001:db8::2', ['2001:db8::1'])).toBe(false);
    });

    // Regression test for a real bug caught live this session: Node/Express
    // commonly reports an IPv4 connection as an IPv4-mapped IPv6 address
    // ("::ffff:x.x.x.x"). An earlier version of this matcher's fail-open
    // check was a bare `ip.includes(':')`, which matched this form too —
    // silently disabling the entire allowlist for every real IPv4 request
    // masquerading in this notation. It should be unwrapped and checked
    // against the allowlist as ordinary IPv4, NOT waved through.
    it('unwraps an IPv4-mapped IPv6 address and enforces the allowlist against it', () => {
      expect(matchesAny('::ffff:203.0.113.9', ['203.0.113.9'])).toBe(true);
      expect(matchesAny('::ffff:203.0.113.10', ['203.0.113.9'])).toBe(false);
      expect(matchesAny('::ffff:10.0.0.42', ['10.0.0.0/24'])).toBe(true);
      expect(matchesAny('::ffff:10.0.1.42', ['10.0.0.0/24'])).toBe(false);
    });

    it('unwraps an uppercase IPv4-mapped IPv6 address too', () => {
      expect(matchesAny('::FFFF:203.0.113.9', ['203.0.113.9'])).toBe(true);
    });
  });

  describe('malformed input', () => {
    it('rejects a non-IP string rather than throwing', () => {
      expect(matchesAny('not-an-ip', ['10.0.0.0/8'])).toBe(false);
    });

    it('rejects an IPv4 address with an out-of-range octet', () => {
      expect(matchesAny('10.0.0.999', ['10.0.0.0/24'])).toBe(false);
    });
  });
});
