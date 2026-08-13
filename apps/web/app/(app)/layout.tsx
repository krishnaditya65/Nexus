'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { AuthGuard } from '@/components/auth-guard';
import { useAuthStore } from '@/lib/auth-store';
import { useUnreadNotificationCount } from '@/lib/hooks/use-notifications';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations('nav');
  const tCommon = useTranslations('common');
  const router = useRouter();
  const signOut = useAuthStore((s) => s.signOut);
  const claims = useAuthStore((s) => s.claims);
  const unread = useUnreadNotificationCount();

  return (
    <AuthGuard>
      <div className="min-h-screen">
        <header className="flex items-center justify-between border-b border-border px-6 py-3">
          <div className="flex items-center gap-6">
            <Link href="/" className="font-semibold">
              {tCommon('appName')}
            </Link>
            <nav className="flex gap-4 text-sm">
              <Link href="/" className="text-text-secondary hover:text-text-primary">
                {t('projects')}
              </Link>
              <Link href="/repos" className="text-text-secondary hover:text-text-primary">
                {t('repos')}
              </Link>
              <Link href="/code-search" className="text-text-secondary hover:text-text-primary">
                {t('codeSearch')}
              </Link>
              <Link href="/search" className="text-text-secondary hover:text-text-primary">
                {t('search')}
              </Link>
              <Link href="/runners" className="text-text-secondary hover:text-text-primary">
                {t('runners')}
              </Link>
              <Link href="/channels" className="text-text-secondary hover:text-text-primary">
                {t('channels')}
              </Link>
              <Link href="/flaky-tests" className="text-text-secondary hover:text-text-primary">
                {t('flakyTests')}
              </Link>
              <Link href="/delivery-plans" className="text-text-secondary hover:text-text-primary">
                {t('deliveryPlans')}
              </Link>
              <Link href="/okrs" className="text-text-secondary hover:text-text-primary">
                {t('okrs')}
              </Link>
              <Link href="/portfolio" className="text-text-secondary hover:text-text-primary">
                {t('portfolio')}
              </Link>
              <Link href="/approvals" className="text-text-secondary hover:text-text-primary">
                {t('myApprovals')}
              </Link>
              <Link href="/artifacts" className="text-text-secondary hover:text-text-primary">
                {t('artifacts')}
              </Link>
              <Link href="/settings/permissions" className="text-text-secondary hover:text-text-primary">
                {t('settings')}
              </Link>
            </nav>
          </div>
          <div className="flex items-center gap-4 text-sm text-text-secondary">
            <Link href="/notifications" className="relative hover:text-text-primary">
              {t('notifications')}
              {!!unread.data?.count && (
                <span className="ml-1 rounded-full bg-accent px-1.5 py-0.5 text-xs font-medium text-white">
                  {unread.data.count}
                </span>
              )}
            </Link>
            {claims && <span>{claims.email}</span>}
            <button
              onClick={() => {
                signOut();
                router.push('/login');
              }}
              className="rounded border border-border px-2 py-1 hover:border-accent hover:text-text-primary"
            >
              {t('signOut')}
            </button>
          </div>
        </header>
        <main className="p-6">{children}</main>
      </div>
    </AuthGuard>
  );
}
