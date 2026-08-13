'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useBoard, BoardColumn } from '@/lib/hooks/use-board';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';

type GroupBy = 'none' | 'assignee' | 'epic';

export default function BoardPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('board');
  const tCommon = useTranslations('common');
  const [groupBy, setGroupBy] = useState<GroupBy>('none');
  const { data, isLoading, error } = useBoard(params.projectId, null, groupBy === 'none' ? null : groupBy);
  const { data: users } = useTenantUsers();

  function assigneeName(userId: string | null) {
    if (!userId) return null;
    return users?.find((u) => u.id === userId)?.display_name ?? null;
  }

  if (isLoading) return <p className="text-text-secondary">{tCommon('loading')}</p>;
  if (error) return <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>;

  const hasColumns = data && 'columns' in data && data.columns.length > 0;
  const hasSwimlanes = data && 'swimlanes' in data && data.swimlanes.length > 0;
  if (!hasColumns && !hasSwimlanes) return <p className="text-text-secondary">{t('noBoard')}</p>;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-text-secondary">{t('swimlaneGroupLabel')}</span>
          <select
            className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as GroupBy)}
          >
            <option value="none">{t('swimlaneNone')}</option>
            <option value="assignee">{t('swimlaneAssignee')}</option>
            <option value="epic">{t('swimlaneEpic')}</option>
          </select>
        </label>
      </div>

      {data && 'columns' in data && (
        <BoardColumns columns={data.columns} t={t} assigneeName={assigneeName} />
      )}

      {data && 'swimlanes' in data && (
        <div className="space-y-6">
          {data.swimlanes.map((lane) => (
            <section key={lane.key}>
              <h2 className="mb-2 text-sm font-medium text-text-secondary">
                {lane.label ?? assigneeName(lane.key) ?? t('unassignedLane')}
              </h2>
              <BoardColumns columns={lane.columns} t={t} assigneeName={assigneeName} />
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function BoardColumns({
  columns,
  t,
  assigneeName,
}: {
  columns: BoardColumn[];
  t: ReturnType<typeof useTranslations>;
  assigneeName: (userId: string | null) => string | null;
}) {
  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {columns.map((col) => (
        <section
          key={col.id}
          aria-labelledby={`col-${col.id}-heading`}
          className={`w-72 shrink-0 rounded-lg border p-3 ${
            col.wipViolation ? 'border-danger bg-danger/5' : 'border-border bg-surface-raised'
          }`}
        >
          <h2 id={`col-${col.id}-heading`} className="mb-1 flex items-center justify-between text-sm font-semibold">
            <span>{col.name}</span>
            <span className={col.wipViolation ? 'text-danger' : 'text-text-secondary'}>
              {col.wipLimit != null ? `${col.ticketCount}/${col.wipLimit}` : col.ticketCount}
            </span>
          </h2>
          {col.wipViolation && (
            <p role="alert" className="mb-2 text-xs text-danger">
              {t('wipViolation', { count: col.ticketCount, limit: col.wipLimit })}
            </p>
          )}
          <ul className="space-y-2">
            {col.tickets.map((ticket) => (
              <li key={ticket.id} className="rounded border border-border bg-surface p-2 text-sm">
                <p className="mb-1 text-text-secondary">
                  {ticket.type} · #{ticket.ticket_number}
                </p>
                <p>{ticket.title}</p>
                {ticket.story_points != null && (
                  <p className="mt-1 text-xs text-text-secondary">
                    {t('storyPoints', { points: Number(ticket.story_points) })}
                  </p>
                )}
                {assigneeName(ticket.assignee_user_id) && (
                  <p className="mt-1 text-xs text-text-secondary">{assigneeName(ticket.assignee_user_id)}</p>
                )}
              </li>
            ))}
            {col.tickets.length === 0 && <li className="text-xs text-text-secondary">{t('emptyColumn')}</li>}
          </ul>
        </section>
      ))}
    </div>
  );
}
