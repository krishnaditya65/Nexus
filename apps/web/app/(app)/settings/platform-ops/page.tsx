'use client';

import { useTranslations } from 'next-intl';
import { usePlatformHealth } from '@/lib/hooks/use-platform-ops';
import { SettingsNav } from '@/components/settings-nav';

function StatusDot({ status }: { status: 'ok' | 'degraded' | 'unreachable' }) {
  const color = status === 'ok' ? 'bg-success' : status === 'degraded' ? 'bg-warn' : 'bg-danger';
  return <span className={`inline-block h-2 w-2 rounded-full ${color}`} />;
}

export default function PlatformOpsPage() {
  const t = useTranslations('platformOps');
  const tCommon = useTranslations('common');
  const { data: services, isLoading, dataUpdatedAt } = usePlatformHealth();

  const totalMemoryMb = services?.reduce((sum, s) => sum + (s.memoryUsageMb ?? 0), 0) ?? 0;
  const okCount = services?.filter((s) => s.status === 'ok').length ?? 0;

  return (
    <div className="mx-auto max-w-3xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      {services && (
        <div className="mb-4 flex gap-6 text-sm">
          <span>{t('healthySummary', { ok: okCount, total: services.length })}</span>
          <span>{t('totalMemory', { mb: totalMemoryMb })}</span>
          <span className="text-text-secondary">
            {t('lastPolled', { time: new Date(dataUpdatedAt).toLocaleTimeString() })}
          </span>
        </div>
      )}

      <div className="overflow-x-auto rounded border border-border">
        <table className="w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="p-2 text-left">{t('serviceColumn')}</th>
              <th className="p-2 text-left">{t('statusColumn')}</th>
              <th className="p-2 text-left">{t('uptimeColumn')}</th>
              <th className="p-2 text-left">{t('memoryColumn')}</th>
            </tr>
          </thead>
          <tbody>
            {services?.map((s) => (
              <tr key={s.name} className="border-b border-border last:border-0">
                <td className="p-2 font-mono">{s.name}</td>
                <td className="p-2">
                  <span className="flex items-center gap-2">
                    <StatusDot status={s.status} />
                    {s.status === 'unreachable' ? s.error : s.status}
                  </span>
                </td>
                <td className="p-2">
                  {s.uptimeSeconds != null ? `${Math.round(s.uptimeSeconds / 60)} min` : '—'}
                </td>
                <td className="p-2">{s.memoryUsageMb != null ? `${s.memoryUsageMb} MB` : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
