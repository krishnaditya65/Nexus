'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  RetroCategory,
  useRetrospective,
  useAddRetroItem,
  useRemoveRetroItem,
  useCloseRetrospective,
} from '@/lib/hooks/use-retrospectives';

const COLUMNS: { category: RetroCategory; labelKey: string }[] = [
  { category: 'went_well', labelKey: 'wentWell' },
  { category: 'went_poorly', labelKey: 'wentPoorly' },
  { category: 'action_item', labelKey: 'actionItems' },
];

export default function RetrospectiveBoardPage({ params }: { params: { retroId: string } }) {
  const t = useTranslations('retrospectives');
  const tCommon = useTranslations('common');
  const retroId = params.retroId;

  const { data: retro, isLoading, error } = useRetrospective(retroId);
  const addItem = useAddRetroItem(retroId);
  const removeItem = useRemoveRetroItem(retroId);
  const closeRetro = useCloseRetrospective(retroId);

  const [drafts, setDrafts] = useState<Record<RetroCategory, string>>({
    went_well: '',
    went_poorly: '',
    action_item: '',
  });

  return (
    <div className="mx-auto max-w-5xl">
      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {retro && (
        <>
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold">{retro.title}</h1>
            {retro.status === 'open' ? (
              <button
                className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
                disabled={closeRetro.isPending}
                onClick={() => closeRetro.mutate()}
              >
                {t('closeRetro')}
              </button>
            ) : (
              <span className="rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
                {t('statusClosed')}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {COLUMNS.map(({ category, labelKey }) => (
              <div key={category} className="rounded border border-border">
                <h2 className="border-b border-border px-3 py-2 text-sm font-medium">{t(labelKey)}</h2>
                <ul className="divide-y divide-border">
                  {retro.items[category]?.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2 px-3 py-2 text-sm">
                      <span>{item.content}</span>
                      {retro.status === 'open' && (
                        <button
                          className="shrink-0 text-xs text-danger hover:underline"
                          onClick={() => removeItem.mutate(item.id)}
                        >
                          {tCommon('cancel')}
                        </button>
                      )}
                    </li>
                  ))}
                  {retro.items[category]?.length === 0 && (
                    <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyColumn')}</li>
                  )}
                </ul>
                {retro.status === 'open' && (
                  <form
                    className="flex gap-1 border-t border-border p-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const content = drafts[category].trim();
                      if (!content) return;
                      addItem.mutate(
                        { category, content },
                        { onSuccess: () => setDrafts((prev) => ({ ...prev, [category]: '' })) },
                      );
                    }}
                  >
                    <label htmlFor={`draft-${category}`} className="sr-only">
                      {t(labelKey)}
                    </label>
                    <input
                      id={`draft-${category}`}
                      className="flex-1 rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                      placeholder={t('itemPlaceholder')}
                      value={drafts[category]}
                      onChange={(e) => setDrafts((prev) => ({ ...prev, [category]: e.target.value }))}
                    />
                    <button
                      type="submit"
                      disabled={addItem.isPending}
                      className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                    >
                      {t('addItem')}
                    </button>
                  </form>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
