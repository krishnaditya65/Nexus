import { useMutation } from '@tanstack/react-query';
import { startAuthentication, type PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';
import { useAuthStore } from '../auth-store';

interface LoginResponse {
  accessToken: string;
  tokenType: string;
  expiresIn: number;
}

interface MfaChallengeResponse {
  mfaRequired: true;
  challengeId: string;
  expiresIn: number;
}

/** Platform-enforced 2FA policy (docs/FEATURES.md §13.8) — the tenant
 *  requires MFA and this user hasn't enrolled yet. `enrollmentToken` is
 *  deliberately NOT stored via setSession (see AuthService.login's
 *  docblock: it's a short-lived, narrowly-scoped credential, not a real
 *  session) — the login page redirects to /mfa-setup with it instead. */
interface MfaEnrollmentRequiredResponse {
  mfaEnrollmentRequired: true;
  enrollmentToken: string;
  expiresIn: number;
}

/** Device fingerprinting + "new device" challenge (docs/FEATURES.md
 *  §11.1, opt-in per tenant) — a brand-new device needs the emailed code
 *  confirmed via useDeviceLoginVerify before a real token issues. */
interface DeviceVerificationRequiredResponse {
  deviceVerificationRequired: true;
  challengeId: string;
  expiresIn: number;
}

const DEVICE_ID_STORAGE_KEY = 'nexus-device-id';

/** A persistent, client-generated device id (NOT passive browser
 *  fingerprinting — see services/auth's 013_device_fingerprinting.sql
 *  docblock) — generated once and reused on every login from this
 *  browser so a device, once verified, stays verified. */
export function getOrCreateDeviceId(): string {
  let id = localStorage.getItem(DEVICE_ID_STORAGE_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(DEVICE_ID_STORAGE_KEY, id);
  }
  return id;
}

export function useLogin() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation<
    LoginResponse | MfaChallengeResponse | MfaEnrollmentRequiredResponse | DeviceVerificationRequiredResponse,
    ApiError,
    { tenantSlug: string; email: string; password: string }
  >({
    mutationFn: (body) =>
      apiFetch<LoginResponse | MfaChallengeResponse | MfaEnrollmentRequiredResponse | DeviceVerificationRequiredResponse>(
        SERVICE_URLS.auth,
        '/auth/login',
        { method: 'POST', body: JSON.stringify({ ...body, deviceId: getOrCreateDeviceId() }) },
      ),
    onSuccess: (data, variables) => {
      if ('accessToken' in data) setSession(data.accessToken, variables.tenantSlug);
    },
  });
}

/** Second half of a new-device-gated login — see DevicesService's
 *  docblock. Same shape as useMfaLoginVerify. */
export function useDeviceLoginVerify() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation<LoginResponse, ApiError, { tenantSlug: string; challengeId: string; code: string }>({
    mutationFn: (body) =>
      apiFetch<LoginResponse>(SERVICE_URLS.auth, '/auth/device/verify', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data, variables) => {
      setSession(data.accessToken, variables.tenantSlug);
    },
  });
}

/** Second half of an MFA-gated login — see services/auth's
 *  auth.service.ts's docblock for why the challenge is an opaque
 *  server-side id rather than a JWT. */
export function useMfaLoginVerify() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation<LoginResponse, ApiError, { tenantSlug: string; challengeId: string; code: string }>({
    mutationFn: (body) =>
      apiFetch<LoginResponse>(SERVICE_URLS.auth, '/auth/mfa/login-verify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data, variables) => {
      setSession(data.accessToken, variables.tenantSlug);
    },
  });
}

/** WebAuthn equivalent of useMfaLoginVerify — runs the full browser
 *  assertion ceremony (fetch options → navigator.credentials.get via
 *  @simplewebauthn/browser → verify) as one mutation, same "no
 *  meaningful half-finished state" reasoning as useRegisterPasskey. */
export function useWebauthnLoginVerify() {
  const setSession = useAuthStore((s) => s.setSession);

  return useMutation<LoginResponse, ApiError, { tenantSlug: string; challengeId: string }>({
    mutationFn: async ({ tenantSlug, challengeId }) => {
      const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
        SERVICE_URLS.auth,
        '/auth/webauthn/login-options',
        { method: 'POST', body: JSON.stringify({ tenantSlug, challengeId }) },
      );
      const response = await startAuthentication({ optionsJSON: options });
      return apiFetch<LoginResponse>(SERVICE_URLS.auth, '/auth/webauthn/login-verify', {
        method: 'POST',
        body: JSON.stringify({ tenantSlug, challengeId, response }),
      });
    },
    onSuccess: (data, variables) => {
      setSession(data.accessToken, variables.tenantSlug);
    },
  });
}
