'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  useSavedQueries,
  useExecuteSavedQuery,
  useUpdateQuery,
  useSetTicketDueDate,
  type QueryTicket,
  type ViewType,
  type SavedQuery,
} from '@/lib/hooks/use-queries';

const VIEW_TYPES: ViewType[] = ['list', 'calendar', 'table', 'workload'];

function ListView({ tickets }: { tickets: QueryTicket[] }) {
  return (
    <ul className="divide-y divide-border rounded border border-border">
      {tickets.map((t) => (
        <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
          <span>
            <span className="font-mono text-text-secondary">#{t.ticket_number}</span> {t.title}
          </span>
          <span className="rounded bg-surface-raised px-2 py-0.5 text-xs text-text-secondary">{t.state_name}</span>
        </li>
      ))}
    </ul>
  );
}

function TableView({ tickets }: { tickets: QueryTicket[] }) {
  const t = useTranslations('views');
  return (
    <div className="overflow-x-auto rounded border border-border">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs text-text-secondary">
            <th className="px-3 py-2">#</th>
            <th className="px-3 py-2">Title</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">State</th>
            <th className="px-3 py-2">Story pts</th>
            <th className="px-3 py-2">{t('dueDateLabel')}</th>
          </tr>
        </thead>
        <tbody>
          {tickets.map((tk) => (
            <tr key={tk.id} className="border-b border-border last:border-0">
              <td className="px-3 py-2 font-mono text-text-secondary">{tk.ticket_number}</td>
              <td className="px-3 py-2">{tk.title}</td>
              <td className="px-3 py-2 text-text-secondary">{tk.type}</td>
              <td className="px-3 py-2">{tk.state_name}</td>
              <td className="px-3 py-2">{tk.story_points ?? '—'}</td>
              <td className="px-3 py-2 text-text-secondary">{tk.due_date ?? t('noDueDate')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CalendarView({ tickets }: { tickets: QueryTicket[] }) {
  const t = useTranslations('views');
  const setDueDate = useSetTicketDueDate();
  const { withDate, without } = useMemo(() => {
    const withDate = tickets.filter((tk) => tk.due_date);
    const without = tickets.filter((tk) => !tk.due_date);
    const byDate = new Map<string, QueryTicket[]>();
    for (const tk of withDate) {
      const key = tk.due_date!;
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(tk);
    }
    return { withDate: [...byDate.entries()].sort(([a], [b]) => a.localeCompare(b)), without };
  }, [tickets]);

  return (
    <div>
      <ul className="mb-4 divide-y divide-border rounded border border-border">
        {withDate.map(([date, dayTickets]) => (
          <li key={date} className="px-4 py-2">
            <p className="mb-1 text-xs font-medium text-text-secondary">{date}</p>
            {dayTickets.map((tk) => (
              <div key={tk.id} className="flex items-center justify-between py-0.5 text-sm">
                <span>
                  <span className="font-mono text-text-secondary">#{tk.ticket_number}</span> {tk.title}
                </span>
                <input
                  type="date"
                  defaultValue={tk.due_date ?? ''}
                  onBlur={(e) => e.target.value !== tk.due_date && setDueDate.mutate({ ticketId: tk.id, dueDate: e.target.value || null })}
                  className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
                />
              </div>
            ))}
          </li>
        ))}
        {withDate.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('noDueDate')}</li>}
      </ul>
      {without.length > 0 && (
        <div className="rounded border border-border p-3">
          <p className="mb-2 text-xs font-medium text-text-secondary">{t('noDueDate')}</p>
          {without.map((tk) => (
            <div key={tk.id} className="flex items-center justify-between py-1 text-sm">
              <span>
                <span className="font-mono text-text-secondary">#{tk.ticket_number}</span> {tk.title}
              </span>
              <input
                type="date"
                onBlur={(e) => e.target.value && setDueDate.mutate({ ticketId: tk.id, dueDate: e.target.value })}
                className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WorkloadView({ tickets, groupBy }: { tickets: QueryTicket[]; groupBy: string }) {
  const t = useTranslations('views');
  const groups = useMemo(() => {
    const byGroup = new Map<string, QueryTicket[]>();
    for (const tk of tickets) {
      const key = groupBy === 'stateName' ? tk.state_name : (tk.assignee_user_id ?? '__unassigned__');
      if (!byGroup.has(key)) byGroup.set(key, []);
      byGroup.get(key)!.push(tk);
    }
    return [...byGroup.entries()];
  }, [tickets, groupBy]);

  return (
    <ul className="space-y-3">
      {groups.map(([key, groupTickets]) => {
        const totalPoints = groupTickets.reduce((sum, tk) => sum + (tk.story_points ?? 0), 0);
        const label = key === '__unassigned__' ? t('unassigned') : key;
        return (
          <li key={key} className="rounded border border-border p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-sm">{label}</span>
              <span className="text-xs text-text-secondary">
                {t('ticketCount', { count: groupTickets.length })} · {t('totalPoints', { points: totalPoints })}
              </span>
            </div>
            <ul className="space-y-0.5">
              {groupTickets.map((tk) => (
                <li key={tk.id} className="text-sm text-text-secondary">
                  <span className="font-mono">#{tk.ticket_number}</span> {tk.title}
                </li>
              ))}
            </ul>
          </li>
        );
      })}
      {groups.length === 0 && <li className="text-text-secondary">{t('noDueDate')}</li>}
    </ul>
  );
}

export default function ViewsPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('views');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: savedQueries } = useSavedQueries(projectId);
  const executeSavedQuery = useExecuteSavedQuery(projectId);
  const updateQuery = useUpdateQuery(projectId);
  const [activeQuery, setActiveQuery] = useState<SavedQuery | null>(null);

  const results = executeSavedQuery.data ?? [];

  function selectQuery(q: SavedQuery) {
    setActiveQuery(q);
    executeSavedQuery.mutate(q.id);
  }

  return (
    <div className="mx-auto max-w-4xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <div className="mb-4 flex flex-wrap gap-2">
        {savedQueries?.map((q) => (
          <button
            key={q.id}
            onClick={() => selectQuery(q)}
            className={`rounded border px-3 py-1.5 text-sm ${
              activeQuery?.id === q.id ? 'border-accent bg-accent/10 text-accent' : 'border-border hover:bg-surface-raised'
            }`}
          >
            {q.name}
          </button>
        ))}
        {savedQueries?.length === 0 && <p className="text-sm text-text-secondary">{tCommon('none')}</p>}
      </div>

      {activeQuery && (
        <div className="mb-4 flex items-center gap-4">
          <div>
            <label className="mr-2 text-xs font-medium text-text-secondary">{t('viewTypeLabel')}</label>
            <select
              value={activeQuery.view_type}
              onChange={(e) => {
                const viewType = e.target.value as ViewType;
                setActiveQuery({ ...activeQuery, view_type: viewType });
                updateQuery.mutate({ id: activeQuery.id, viewType });
              }}
              className="rounded border border-border bg-surface px-2 py-1 text-sm"
            >
              {VIEW_TYPES.map((vt) => (
                <option key={vt} value={vt}>
                  {t(`view_${vt}`)}
                </option>
              ))}
            </select>
          </div>
          {activeQuery.view_type === 'workload' && (
            <div>
              <label className="mr-2 text-xs font-medium text-text-secondary">{t('groupByLabel')}</label>
              <select
                value={activeQuery.group_by ?? 'assigneeUserId'}
                onChange={(e) => {
                  const groupBy = e.target.value;
                  setActiveQuery({ ...activeQuery, group_by: groupBy });
                  updateQuery.mutate({ id: activeQuery.id, groupBy });
                }}
                className="rounded border border-border bg-surface px-2 py-1 text-sm"
              >
                <option value="assigneeUserId">{t('groupBy_assigneeUserId')}</option>
                <option value="stateName">{t('groupBy_stateName')}</option>
              </select>
            </div>
          )}
        </div>
      )}

      {executeSavedQuery.isPending && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {executeSavedQuery.error && (
        <p className="text-danger">{tCommon('errorGeneric', { message: executeSavedQuery.error.message })}</p>
      )}

      {activeQuery && !executeSavedQuery.isPending && (
        <>
          {activeQuery.view_type === 'list' && <ListView tickets={results} />}
          {activeQuery.view_type === 'table' && <TableView tickets={results} />}
          {activeQuery.view_type === 'calendar' && <CalendarView tickets={results} />}
          {activeQuery.view_type === 'workload' && (
            <WorkloadView tickets={results} groupBy={activeQuery.group_by ?? 'assigneeUserId'} />
          )}
        </>
      )}
    </div>
  );
}
