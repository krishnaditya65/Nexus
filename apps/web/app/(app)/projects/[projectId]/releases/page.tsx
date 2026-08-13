'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useReleases, useCreateRelease, useSetReleaseStatus, useReleaseNotes } from '@/lib/hooks/use-releases';

export default function ReleasesPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('releases');
  const tCommon = useTranslations('common');
  const { data: releases, isLoading, error } = useReleases(params.projectId);
  const createRelease = useCreateRelease(params.projectId);
  const setStatus = useSetReleaseStatus(params.projectId);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const notes = useReleaseNotes(expandedId);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-8 divide-y divide-border rounded border border-border">
        {releases?.map((r) => (
          <li key={r.id} className="px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 rounded bg-surface px-1.5 py-0.5 text-xs text-text-secondary">{r.status}</span>
                {r.release_date && <span className="ml-2 text-xs text-text-secondary">{r.release_date}</span>}
              </div>
              <div className="flex gap-2 text-xs">
                <button
                  className="text-accent hover:underline"
                  onClick={() => setExpandedId(expandedId === r.id ? null : r.id)}
                >
                  {t('notesLink')}
                </button>
                {r.status === 'unreleased' && (
                  <button className="text-accent hover:underline" onClick={() => setStatus.mutate({ releaseId: r.id, status: 'released' })}>
                    {t('markReleased')}
                  </button>
                )}
                {r.status !== 'archived' && (
                  <button className="text-text-secondary hover:underline" onClick={() => setStatus.mutate({ releaseId: r.id, status: 'archived' })}>
                    {t('archive')}
                  </button>
                )}
              </div>
            </div>
            {r.description && <p className="mt-1 text-xs text-text-secondary">{r.description}</p>}
            {expandedId === r.id && notes.data && (
              <div className="mt-2 rounded border border-border bg-surface-raised p-2 text-xs">
                {Object.entries(notes.data.ticketsByType).map(([type, tickets]) => (
                  <div key={type} className="mb-1">
                    <p className="font-medium">{type}</p>
                    <ul className="ml-3 list-disc">
                      {tickets.map((tk) => (
                        <li key={tk.id}>
                          #{tk.ticket_number} {tk.title} ({tk.state_name})
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
                {Object.keys(notes.data.ticketsByType).length === 0 && <p>{t('emptyNotes')}</p>}
              </div>
            )}
          </li>
        ))}
        {releases?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>

      <form
        className="flex flex-col gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const trimmed = name.trim();
          if (!trimmed) return;
          createRelease.mutate({ name: trimmed, description }, { onSuccess: () => { setName(''); setDescription(''); } });
        }}
      >
        <label htmlFor="release-name" className="sr-only">
          {t('namePlaceholder')}
        </label>
        <input
          id="release-name"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <label htmlFor="release-description" className="sr-only">
          {t('descriptionPlaceholder')}
        </label>
        <input
          id="release-description"
          className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
          placeholder={t('descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
        <button
          type="submit"
          disabled={createRelease.isPending}
          className="self-start rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {t('create')}
        </button>
      </form>
    </div>
  );
}
