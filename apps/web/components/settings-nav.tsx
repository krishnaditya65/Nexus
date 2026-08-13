'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

const LINKS = [
  { href: '/settings/permissions', labelKey: 'permissionsTitle' },
  { href: '/settings/sso', labelKey: 'ssoTitle' },
  { href: '/settings/divisions', labelKey: 'divisionsTitle' },
  { href: '/settings/security', labelKey: 'securityTitle' },
  { href: '/settings/network', labelKey: 'networkTitle' },
  { href: '/settings/vendor-spend', labelKey: 'vendorSpendTitle' },
  { href: '/settings/timesheets', labelKey: 'timesheetsTitle' },
  { href: '/settings/data-retention', labelKey: 'dataRetentionTitle' },
  { href: '/settings/platform-ops', labelKey: 'platformOpsTitle' },
  { href: '/settings/service-hooks', labelKey: 'serviceHooksTitle' },
  { href: '/settings/connectors', labelKey: 'connectorsTitle' },
  { href: '/settings/activity', labelKey: 'activityTitle' },
  { href: '/settings/pipelines-library', labelKey: 'pipelinesLibraryTitle' },
] as const;

export function SettingsNav() {
  const t = useTranslations('settings');
  const pathname = usePathname();
  return (
    <nav className="mb-6 flex gap-4 border-b border-border text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`-mb-px border-b-2 px-1 pb-2 ${
            pathname === link.href ? 'border-accent text-text-primary' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          {t(link.labelKey)}
        </Link>
      ))}
    </nav>
  );
}
