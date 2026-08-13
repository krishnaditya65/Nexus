'use client';

// Drives the subdomain-based login flow documented in
// docs/ARCHITECTURE.md: extract a tenant slug from the hostname, resolve
// it (404 → "workspace not found"), check SSO availability, and either
// redirect into SSO or render the password form. Falls back to a manual
// workspace-slug field when no subdomain is present (every local-dev
// hostname, since localhost has no subdomain to extract).
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { extractTenantSlugFromHost } from '@/lib/tenant-subdomain';
import { useTenantResolution, useSsoAvailability } from '@/lib/hooks/use-tenant-resolution';
import { useLogin, useMfaLoginVerify, useWebauthnLoginVerify, useDeviceLoginVerify } from '@/lib/hooks/use-login';
import { SERVICE_URLS } from '@/lib/service-urls';

export default function LoginPage() {
  const t = useTranslations('login');
  const router = useRouter();

  const [manualSlug, setManualSlug] = useState('');
  const [subdomainSlug, setSubdomainSlug] = useState<string | null>(null);
  useEffect(() => {
    setSubdomainSlug(extractTenantSlugFromHost(window.location.hostname));
  }, []);

  const tenantSlug = subdomainSlug ?? (manualSlug.trim() || null);
  const resolution = useTenantResolution(tenantSlug);
  const sso = useSsoAvailability(resolution.data ? tenantSlug : null);
  const login = useLogin();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaChallengeId, setMfaChallengeId] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState('');
  const mfaVerify = useMfaLoginVerify();
  const webauthnVerify = useWebauthnLoginVerify();

  const [deviceChallengeId, setDeviceChallengeId] = useState<string | null>(null);
  const [deviceCode, setDeviceCode] = useState('');
  const deviceVerify = useDeviceLoginVerify();

  useEffect(() => {
    if (sso.data?.ssoEnabled && tenantSlug) {
      window.location.href = `${SERVICE_URLS.identityFederation}/sso/${tenantSlug}/login`;
    }
  }, [sso.data, tenantSlug]);

  useEffect(() => {
    if (!login.isSuccess || !login.data) return;
    if ('mfaRequired' in login.data) {
      setMfaChallengeId(login.data.challengeId);
    } else if ('deviceVerificationRequired' in login.data) {
      setDeviceChallengeId(login.data.challengeId);
    } else if ('mfaEnrollmentRequired' in login.data) {
      // §13.8 — the tenant requires MFA and this user hasn't enrolled.
      // sessionStorage (not the auth store / a URL param) because this
      // token is short-lived and not a real session — see use-login.ts's
      // docblock.
      sessionStorage.setItem('mfaEnrollmentToken', login.data.enrollmentToken);
      router.push('/mfa-setup');
    } else {
      router.push('/');
    }
  }, [login.isSuccess, login.data, router]);

  useEffect(() => {
    if (mfaVerify.isSuccess || webauthnVerify.isSuccess || deviceVerify.isSuccess) router.push('/');
  }, [mfaVerify.isSuccess, webauthnVerify.isSuccess, deviceVerify.isSuccess, router]);

  if (sso.data?.ssoEnabled) {
    return <p className="p-8 text-text-secondary">{t('ssoRedirecting')}</p>;
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface-raised p-6">
        <h1 className="mb-6 text-lg font-semibold">
          {resolution.data ? t('title', { workspaceName: resolution.data.displayName }) : t('titleUnknownWorkspace')}
        </h1>

        {!subdomainSlug && (
          <div className="mb-4">
            <label htmlFor="workspace-slug" className="mb-1 block text-sm text-text-secondary">
              Workspace
            </label>
            <input
              id="workspace-slug"
              className="w-full rounded border border-border bg-surface px-3 py-2"
              value={manualSlug}
              onChange={(e) => setManualSlug(e.target.value)}
              placeholder="acme"
              autoComplete="organization"
            />
          </div>
        )}

        {tenantSlug && resolution.isError && (
          <p role="alert" className="mb-4 text-sm text-danger">
            {t('workspaceNotFound', { subdomain: tenantSlug })}
          </p>
        )}

        {resolution.data && mfaChallengeId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              mfaVerify.mutate({ tenantSlug: resolution.data!.slug, challengeId: mfaChallengeId, code: mfaCode });
            }}
          >
            <p className="mb-4 text-sm text-text-secondary">{t('mfaPrompt')}</p>
            <div className="mb-4">
              <label htmlFor="mfa-code" className="mb-1 block text-sm text-text-secondary">
                {t('mfaCodeLabel')}
              </label>
              <input
                id="mfa-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full rounded border border-border bg-surface px-3 py-2 font-mono tracking-widest"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                autoFocus
              />
            </div>
            {mfaVerify.isError && (
              <p role="alert" className="mb-4 text-sm text-danger">
                {t('mfaInvalidCode')}
              </p>
            )}
            <button
              type="submit"
              disabled={mfaVerify.isPending}
              className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('mfaVerify')}
            </button>

            {webauthnVerify.isError && (
              <p role="alert" className="mt-4 text-sm text-danger">
                {webauthnVerify.error.message || t('webauthnFailed')}
              </p>
            )}
            <button
              type="button"
              disabled={webauthnVerify.isPending}
              onClick={() =>
                webauthnVerify.mutate({ tenantSlug: resolution.data!.slug, challengeId: mfaChallengeId })
              }
              className="mt-3 w-full rounded border border-border px-3 py-2 font-medium hover:bg-surface disabled:opacity-50"
            >
              {t('webauthnUsePasskey')}
            </button>
          </form>
        )}

        {resolution.data && deviceChallengeId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              deviceVerify.mutate({ tenantSlug: resolution.data!.slug, challengeId: deviceChallengeId, code: deviceCode });
            }}
          >
            <p className="mb-4 text-sm text-text-secondary">{t('deviceChallengePrompt')}</p>
            <div className="mb-4">
              <label htmlFor="device-code" className="mb-1 block text-sm text-text-secondary">
                {t('deviceCodeLabel')}
              </label>
              <input
                id="device-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                className="w-full rounded border border-border bg-surface px-3 py-2 font-mono tracking-widest"
                value={deviceCode}
                onChange={(e) => setDeviceCode(e.target.value)}
                autoFocus
              />
            </div>
            {deviceVerify.isError && (
              <p role="alert" className="mb-4 text-sm text-danger">
                {deviceVerify.error.message || t('deviceCodeInvalid')}
              </p>
            )}
            <button
              type="submit"
              disabled={deviceVerify.isPending}
              className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('deviceVerify')}
            </button>
          </form>
        )}

        {resolution.data && !mfaChallengeId && !deviceChallengeId && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate({ tenantSlug: resolution.data!.slug, email, password });
            }}
          >
            <div className="mb-4">
              <label htmlFor="email" className="mb-1 block text-sm text-text-secondary">
                {t('emailLabel')}
              </label>
              <input
                id="email"
                type="email"
                required
                className="w-full rounded border border-border bg-surface px-3 py-2"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </div>
            <div className="mb-4">
              <label htmlFor="password" className="mb-1 block text-sm text-text-secondary">
                {t('passwordLabel')}
              </label>
              <input
                id="password"
                type="password"
                required
                className="w-full rounded border border-border bg-surface px-3 py-2"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>

            {login.isError && (
              <p role="alert" className="mb-4 text-sm text-danger">
                {/* Surfaces the real backend message rather than a generic
                    string — a lockout response names the exact retry time,
                    which a canned "invalid credentials" string would hide. */}
                {login.error.message || t('invalidCredentials')}
              </p>
            )}

            <button
              type="submit"
              disabled={login.isPending}
              className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
            >
              {t('submit')}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
