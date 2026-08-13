// Thin fetch wrapper: attaches the signed-in Bearer token (see
// lib/auth-store.ts), JSON-encodes bodies, and throws a typed ApiError on
// a non-2xx response with the backend's own error message surfaced (every
// NestJS service here returns { message, error, statusCode } on failure —
// see e.g. RolesGuard's ForbiddenException) rather than a generic
// "request failed". TanStack Query's hooks (see hooks/*.ts) call this
// directly; it's not itself a React hook, so it's usable outside components too.
import { useAuthStore } from './auth-store';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(baseUrl: string, path: string, init?: RequestInit): Promise<T> {
  const { accessToken } = useAuthStore.getState();
  const res = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: {
      'content-type': 'application/json',
      ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}),
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = res.statusText;
    try {
      const body = await res.json();
      message = body.message ?? message;
    } catch {
      // response body wasn't JSON — keep the statusText fallback above
    }
    throw new ApiError(res.status, message);
  }

  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
