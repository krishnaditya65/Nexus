'use client';

// Every page under app/(app)/ renders inside this — redirects to /login if
// there's no session or the token has already expired (see
// useAuthStore.isExpired). This is a UX guard only, exactly like every
// other guard/check in this frontend: it makes the app behave sensibly,
// it is NOT the security boundary. The real boundary is unchanged — each
// backend service verifies the JWT itself against auth's JWKS and enforces
// Postgres RLS regardless of what this component does or doesn't render.
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/lib/auth-store';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const t = useTranslations('common');
  const router = useRouter();
  const accessToken = useAuthStore((s) => s.accessToken);
  const isExpired = useAuthStore((s) => s.isExpired);

  useEffect(() => {
    if (!accessToken || isExpired()) {
      router.replace('/login');
    }
  }, [accessToken, isExpired, router]);

  if (!accessToken || isExpired()) {
    return <p className="p-8 text-text-secondary">{t('loading')}</p>;
  }

  return <>{children}</>;
}
