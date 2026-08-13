'use client';

import { useTranslations } from 'next-intl';
import { useFlakyTests, useUnquarantine } from '@/lib/hooks/use-qa';

export default function FlakyTestsPage() {
  const t = useTranslations('flakyTests');
  const tCommon = useTranslations('common');
  const { data: flaky, isLoading, error } = useFlakyTests();
  const unquarantine = useUnquarantine();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {flaky?.map((f) => (
          <li key={f.test_case_id} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{f.title}</span>
            <button
              onClick={() => unquarantine.mutate(f.test_case_id)}
              disabled={unquarantine.isPending}
              className="rounded border border-border px-2 py-1 text-xs hover:border-accent disabled:opacity-50"
            >
              {t('unquarantine')}
            </button>
          </li>
        ))}
        {flaky?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
