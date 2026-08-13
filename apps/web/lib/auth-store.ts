// Zustand store for the signed-in session: the access token, and the JWT
// claims decoded from it (tenant_id, role, etc. — see services/auth's
// JwtClaims interface, mirrored here). Persisted to localStorage so a page
// reload doesn't force a re-login; this is a plain access token in
// browser storage, the same trust model as every other Jira/ADO-alike
// until a refresh-token + httpOnly-cookie flow replaces it (tracked as a
// gap below, not silently assumed away).
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface JwtClaims {
  sub: string;
  tenant_id: string;
  role: 'owner' | 'admin' | 'member';
  email: string;
  exp: number;
}

interface AuthState {
  accessToken: string | null;
  tenantSlug: string | null;
  claims: JwtClaims | null;
  setSession: (accessToken: string, tenantSlug: string) => void;
  signOut: () => void;
  isExpired: () => boolean;
}

/** Decodes a JWT's payload without verifying the signature — verification
 *  is the backend's job (every service does it against auth's JWKS, see
 *  docs/ARCHITECTURE.md). The frontend only needs the claims to decide
 *  what UI to show (role-gated buttons, current tenant), never to make an
 *  access-control decision itself. */
function decodeClaims(token: string): JwtClaims | null {
  try {
    const payload = token.split('.')[1];
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      tenantSlug: null,
      claims: null,
      setSession: (accessToken, tenantSlug) =>
        set({ accessToken, tenantSlug, claims: decodeClaims(accessToken) }),
      signOut: () => set({ accessToken: null, tenantSlug: null, claims: null }),
      isExpired: () => {
        const claims = get().claims;
        if (!claims) return true;
        return Date.now() >= claims.exp * 1000;
      },
    }),
    { name: 'nexus-auth' },
  ),
);
