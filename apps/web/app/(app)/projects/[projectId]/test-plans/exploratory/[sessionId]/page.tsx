'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useAuthStore } from '@/lib/auth-store';
import {
  useExploratorySession,
  useExploratoryNotes,
  useAddExploratoryNote,
  useCompleteExploratorySession,
} from '@/lib/hooks/use-qa';

export default function ExploratorySessionPage({
  params,
}: {
  params: { projectId: string; sessionId: string };
}) {
  const t = useTranslations('exploratorySessions');
  const tCommon = useTranslations('common');
  const currentUserId = useAuthStore((s) => s.claims?.sub);

  const { data: session, isLoading, error } = useExploratorySession(params.sessionId);
  const { data: notes } = useExploratoryNotes(params.sessionId);
  const addNote = useAddExploratoryNote(params.sessionId);
  const completeSession = useCompleteExploratorySession(params.sessionId);

  const [noteText, setNoteText] = useState('');
  const [bugTicketId, setBugTicketId] = useState('');

  const isOwner = session && currentUserId === session.tester_user_id;
  const isOpen = session?.status === 'in_progress';

  return (
    <div className="mx-auto max-w-2xl">
      <Link
        href={`/projects/${params.projectId}/test-plans/exploratory`}
        className="mb-4 inline-block text-sm text-accent hover:underline"
      >
        {t('backLink')}
      </Link>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {session && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-xl font-semibold">{t('sessionTitle', { charter: session.charter })}</h1>
            {session.status === 'completed' ? (
              <span className="rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">
                {t('completedOn', { date: new Date(session.ended_at!).toLocaleString() })} ·{' '}
                {session.outcome === 'passed' ? t('outcomePassed') : t('outcomeIssuesFound')}
              </span>
            ) : (
              <span className="rounded bg-surface px-2 py-0.5 text-xs text-text-secondary">
                {t('statusInProgress')}
              </span>
            )}
          </div>

          <h2 className="mb-2 text-sm font-medium">{t('notesTitle')}</h2>
          <ul className="mb-4 divide-y divide-border rounded border border-border">
            {notes?.map((note) => (
              <li key={note.id} className="px-3 py-2 text-sm">
                <div>{note.note_text}</div>
                {note.bug_ticket_id && (
                  <div className="mt-1 text-xs text-text-secondary">bug: {note.bug_ticket_id}</div>
                )}
              </li>
            ))}
            {notes?.length === 0 && <li className="px-3 py-2 text-xs text-text-secondary">{t('emptyNotes')}</li>}
          </ul>

          {isOpen ? (
            <>
              <form
                className="mb-4 flex flex-col gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const trimmed = noteText.trim();
                  if (!trimmed) return;
                  addNote.mutate(
                    { noteText: trimmed, bugTicketId: bugTicketId.trim() || undefined },
                    { onSuccess: () => { setNoteText(''); setBugTicketId(''); } },
                  );
                }}
              >
                <label htmlFor="note-text" className="sr-only">
                  {t('notePlaceholder')}
                </label>
                <textarea
                  id="note-text"
                  className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
                  placeholder={t('notePlaceholder')}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  rows={2}
                  required
                />
                <div className="flex gap-2">
                  <label htmlFor="bug-ticket" className="sr-only">
                    {t('bugTicketPlaceholder')}
                  </label>
                  <input
                    id="bug-ticket"
                    className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
                    placeholder={t('bugTicketPlaceholder')}
                    value={bugTicketId}
                    onChange={(e) => setBugTicketId(e.target.value)}
                  />
                  <button
                    type="submit"
                    disabled={addNote.isPending}
                    className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
                  >
                    {t('addNote')}
                  </button>
                </div>
              </form>

              {isOwner ? (
                <div className="flex gap-2">
                  <button
                    disabled={completeSession.isPending}
                    className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
                    onClick={() => completeSession.mutate({ outcome: 'passed' })}
                  >
                    {t('outcomePassed')}
                  </button>
                  <button
                    disabled={completeSession.isPending}
                    className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
                    onClick={() => completeSession.mutate({ outcome: 'issues_found' })}
                  >
                    {t('outcomeIssuesFound')}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-text-secondary">{t('notOwner')}</p>
              )}
            </>
          ) : (
            <p className="text-xs text-text-secondary">{t('sessionCompletedNoNotes')}</p>
          )}
        </>
      )}
    </div>
  );
}
