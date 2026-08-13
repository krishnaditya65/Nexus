'use client';

import { useTranslations } from 'next-intl';
import { useRtm } from '@/lib/hooks/use-qa';

const COVERAGE_KEY: Record<string, string> = {
  no_tests: 'coverageNoTests',
  fully_passing: 'coverageFullyPassing',
  has_failures_or_untested: 'coverageHasFailures',
};

const COVERAGE_COLOR: Record<string, string> = {
  no_tests: 'text-text-secondary',
  fully_passing: 'text-success',
  has_failures_or_untested: 'text-danger',
};

export default function RtmPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('rtm');
  const tCommon = useTranslations('common');
  const { data: rows, isLoading, error } = useRtm(params.projectId);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {rows?.map((row) => (
          <li key={row.requirementTicketId} className="px-4 py-3 text-sm">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium">{row.requirementTitle}</span>
              <span className={COVERAGE_COLOR[row.coverageStatus]}>{t(COVERAGE_KEY[row.coverageStatus] as any)}</span>
            </div>
            <p className="mb-1 text-xs text-text-secondary">{row.requirementState}</p>
            {row.linkedTestCases.length > 0 && (
              <ul className="ml-4 list-disc text-xs text-text-secondary">
                {row.linkedTestCases.map((c) => (
                  <li key={c.id}>
                    {c.title} — {c.latest_status ?? 'never run'}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
        {rows?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
