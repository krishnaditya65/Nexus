'use client';

// Forced MFA enrollment (docs/FEATURES.md §13.8) — reached only when the
// login page got back `mfaEnrollmentRequired` (the tenant owner turned on
// platform-enforced 2FA and this user hasn't set it up yet). Deliberately
// OUTSIDE the (app) route group, same reasoning as /forms/[token]: the
// enrollment token in sessionStorage is NOT a normal session (see
// AuthService.login's docblock), so this page can't rely on the app
// shell's authenticated layout — it calls apiFetch with an explicit
// `authorization` header override instead of the auth store's token.
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { apiFetch, ApiError } from '@/lib/api-client';
import { SERVICE_URLS } from '@/lib/service-urls';

export default function MfaSetupPage() {
  const t = useTranslations('mfaSetup');
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [enrollment, setEnrollment] = useState<{ secret: string; otpauthUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  useEffect(() => {
    const stored = sessionStorage.getItem('mfaEnrollmentToken');
    if (!stored) {
      router.push('/login');
      return;
    }
    setToken(stored);
  }, [router]);

  useEffect(() => {
    if (!token || enrollment) return;
    apiFetch<{ secret: string; otpauthUrl: string }>(SERVICE_URLS.auth, '/auth/mfa/enroll', {
      method: 'POST',
      body: '{}',
      headers: { authorization: `Bearer ${token}` },
    })
      .then(setEnrollment)
      .catch((err: ApiError) => setError(err.message));
  }, [token, enrollment]);

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    if (!token) return;
    setError(null);
    setConfirming(true);
    try {
      const result = await apiFetch<{ recoveryCodes: string[] }>(SERVICE_URLS.auth, '/auth/mfa/enroll/confirm', {
        method: 'POST',
        body: JSON.stringify({ code }),
        headers: { authorization: `Bearer ${token}` },
      });
      setRecoveryCodes(result.recoveryCodes);
      sessionStorage.removeItem('mfaEnrollmentToken');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-surface-raised p-6">
        <h1 className="mb-1 text-lg font-semibold">{t('title')}</h1>
        <p className="mb-4 text-sm text-text-secondary">{t('subtitle')}</p>

        {error && <p className="mb-4 text-sm text-danger">{error}</p>}

        {recoveryCodes ? (
          <div>
            <p role="alert" className="mb-2 text-sm font-medium">
              {t('recoveryCodesShownOnce')}
            </p>
            <ul className="mb-4 grid grid-cols-2 gap-1 rounded border border-warn bg-warn/10 p-3 font-mono text-xs">
              {recoveryCodes.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <button
              className="w-full rounded bg-accent px-3 py-2 text-sm font-medium text-white hover:bg-accent-hover"
              onClick={() => router.push('/login')}
            >
              {t('continueToLogin')}
            </button>
          </div>
        ) : (
          <>
            {enrollment && (
              <div className="mb-4">
                <p className="mb-2 text-sm text-text-secondary">{t('scanPrompt')}</p>
                <p className="mb-1 text-xs text-text-secondary">{t('manualSecretLabel')}</p>
                <code className="mb-4 block rounded bg-surface px-2 py-1 text-xs">{enrollment.secret}</code>
              </div>
            )}
            <form onSubmit={confirm}>
              <label htmlFor="mfa-setup-code" className="mb-1 block text-sm text-text-secondary">
                {t('codeLabel')}
              </label>
              <input
                id="mfa-setup-code"
                inputMode="numeric"
                autoComplete="one-time-code"
                required
                autoFocus
                className="mb-4 w-full rounded border border-border bg-surface px-3 py-2 font-mono tracking-widest"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button
                type="submit"
                disabled={!enrollment || confirming}
                className="w-full rounded bg-accent px-3 py-2 font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              >
                {t('confirm')}
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
