'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMyApprovals, useDecideApproval } from '@/lib/hooks/use-approvals';

export default function MyApprovalsPage() {
  const t = useTranslations('myApprovals');
  const tCommon = useTranslations('common');
  const { data: approvals, isLoading } = useMyApprovals();
  const decide = useDecideApproval();

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-6 text-xl font-semibold">{t('title')}</h1>
      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      <ul className="divide-y divide-border rounded border border-border">
        {approvals?.map((a) => (
          <li key={a.id} className="px-4 py-3">
            <div className="mb-1 flex items-center justify-between">
              <Link
                href={`/projects/${a.project_id}/tickets/${a.ticket_id}`}
                className="text-sm font-medium text-accent hover:underline"
              >
                #{a.ticket_number} {a.ticket_title}
              </Link>
              <span
                className={`rounded px-2 py-0.5 text-xs ${
                  a.status === 'approved'
                    ? 'bg-success/20 text-success'
                    : a.status === 'rejected'
                      ? 'bg-danger/20 text-danger'
                      : 'bg-surface-raised text-text-secondary'
                }`}
              >
                {a.status}
              </span>
            </div>
            {a.request_comment && <p className="mb-2 text-xs text-text-secondary">{a.request_comment}</p>}
            {a.status === 'pending' && (
              <div className="flex gap-2">
                <button
                  onClick={() => decide.mutate({ id: a.id, decision: 'approved' })}
                  disabled={decide.isPending}
                  className="rounded border border-success px-2 py-1 text-xs text-success hover:bg-success/10 disabled:opacity-50"
                >
                  {t('approve')}
                </button>
                <button
                  onClick={() => decide.mutate({ id: a.id, decision: 'rejected' })}
                  disabled={decide.isPending}
                  className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
                >
                  {t('reject')}
                </button>
              </div>
            )}
          </li>
        ))}
        {approvals?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
