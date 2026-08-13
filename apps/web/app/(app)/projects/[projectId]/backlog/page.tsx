'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  useBacklog,
  useSprints,
  useCreateTicket,
  useCreateSprint,
  useStartSprint,
  useCompleteSprint,
  useAssignToSprint,
  useAssignTicket,
  useBulkUpdateTickets,
} from '@/lib/hooks/use-backlog';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';
import { useTicketTemplates, useCreateTicketFromTemplate } from '@/lib/hooks/use-ticket-templates';

const BULK_TRANSITIONS = ['Move to Dev', 'Move to QA', 'Move to Done'];

export default function BacklogPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('backlog');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const backlog = useBacklog(projectId);
  const sprints = useSprints(projectId);
  const createTicket = useCreateTicket(projectId);
  const createSprint = useCreateSprint(projectId);
  const startSprint = useStartSprint(projectId);
  const completeSprint = useCompleteSprint(projectId);
  const assignToSprint = useAssignToSprint(projectId);
  const assignTicket = useAssignTicket(projectId);
  const bulkUpdate = useBulkUpdateTickets(projectId);
  const { data: users } = useTenantUsers();
  const { data: templates } = useTicketTemplates(projectId);
  const createFromTemplate = useCreateTicketFromTemplate(projectId);

  const [title, setTitle] = useState('');
  const [type, setType] = useState('story');
  const [sprintName, setSprintName] = useState('');
  const [sprintGoal, setSprintGoal] = useState('');
  const [templateId, setTemplateId] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkTransition, setBulkTransition] = useState(BULK_TRANSITIONS[0]);
  const [bulkResult, setBulkResult] = useState<{ ticketId: string; ok: boolean; error?: string }[] | null>(null);

  const activeSprint = sprints.data?.find((s) => s.status === 'active');

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <section className="lg:col-span-2">
        <h1 className="mb-4 text-xl font-semibold">{t('title')}</h1>

        {backlog.isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
        {backlog.error && <p className="text-danger">{tCommon('errorGeneric', { message: backlog.error.message })}</p>}

        {selectedIds.length > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded border border-accent bg-accent/5 px-3 py-2 text-sm">
            <span>{t('bulkSelectedCount', { count: selectedIds.length })}</span>
            <label htmlFor="bulk-transition" className="sr-only">
              {t('bulkTransitionLabel')}
            </label>
            <select
              id="bulk-transition"
              className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
              value={bulkTransition}
              onChange={(e) => setBulkTransition(e.target.value)}
            >
              {BULK_TRANSITIONS.map((tr) => (
                <option key={tr} value={tr}>
                  {tr}
                </option>
              ))}
            </select>
            <button
              className="rounded bg-accent px-2 py-1 text-xs font-medium text-white hover:bg-accent-hover disabled:opacity-50"
              disabled={bulkUpdate.isPending}
              onClick={() =>
                bulkUpdate.mutate(
                  { ticketIds: selectedIds, transitionName: bulkTransition },
                  { onSuccess: (result) => { setBulkResult(result); setSelectedIds([]); } },
                )
              }
            >
              {t('bulkApply')}
            </button>
            <button className="text-xs text-text-secondary hover:underline" onClick={() => setSelectedIds([])}>
              {tCommon('cancel')}
            </button>
          </div>
        )}

        {bulkResult && (
          <ul className="mb-3 rounded border border-border bg-surface-raised p-2 text-xs">
            {bulkResult.map((r) => (
              <li key={r.ticketId} className={r.ok ? 'text-success' : 'text-danger'}>
                {r.ticketId.slice(0, 8)}: {r.ok ? t('bulkOk') : r.error}
              </li>
            ))}
          </ul>
        )}

        <ul className="mb-6 divide-y divide-border rounded border border-border">
          {backlog.data?.map((ticket) => (
            <li key={ticket.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={t('bulkSelectTicket', { number: ticket.ticket_number })}
                  checked={selectedIds.includes(ticket.id)}
                  onChange={(e) =>
                    setSelectedIds((prev) => (e.target.checked ? [...prev, ticket.id] : prev.filter((id) => id !== ticket.id)))
                  }
                />
                <Link href={`/projects/${projectId}/tickets/${ticket.id}`} className="hover:underline">
                  <span className="mr-2 text-text-secondary">#{ticket.ticket_number}</span>
                  {ticket.title}
                </Link>
                {ticket.story_points != null && (
                  <span className="ml-2 rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">
                    {ticket.story_points} pt
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <label htmlFor={`assignee-${ticket.id}`} className="sr-only">
                  {t('assignee')}
                </label>
                <select
                  id={`assignee-${ticket.id}`}
                  aria-label={t('assignee')}
                  className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                  value={ticket.assignee_user_id ?? ''}
                  onChange={(e) =>
                    assignTicket.mutate({ ticketId: ticket.id, assigneeUserId: e.target.value || null })
                  }
                >
                  <option value="">{t('unassigned')}</option>
                  {users?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.display_name}
                    </option>
                  ))}
                </select>
                {sprints.data?.find((s) => s.status === 'planned' || s.status === 'active') && (
                  <select
                    aria-label={t('moveToSprint')}
                    className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                    defaultValue=""
                    onChange={(e) => {
                      if (e.target.value) assignToSprint.mutate({ ticketId: ticket.id, sprintId: e.target.value });
                    }}
                  >
                    <option value="" disabled>
                      {t('moveToSprint')}
                    </option>
                    {sprints.data
                      ?.filter((s) => s.status !== 'completed')
                      .map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                  </select>
                )}
              </div>
            </li>
          ))}
          {backlog.data?.length === 0 && <li className="px-3 py-2 text-text-secondary">{t('empty')}</li>}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createTicket.mutate({ type, title }, { onSuccess: () => setTitle('') });
          }}
          className="flex gap-2"
        >
          <label htmlFor="ticket-type" className="sr-only">
            {t('typeLabel')}
          </label>
          <select
            id="ticket-type"
            className="rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={type}
            onChange={(e) => setType(e.target.value)}
          >
            <option value="story">Story</option>
            <option value="bug">Bug</option>
            <option value="task">Task</option>
            <option value="epic">Epic</option>
          </select>
          <label htmlFor="ticket-title" className="sr-only">
            {t('titlePlaceholder')}
          </label>
          <input
            id="ticket-title"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('titlePlaceholder')}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
          />
          <button
            type="submit"
            disabled={createTicket.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('createTicket')}
          </button>
        </form>

        {templates && templates.length > 0 && (
          <form
            className="mt-2 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!templateId) return;
              createFromTemplate.mutate({ templateId }, { onSuccess: () => setTemplateId('') });
            }}
          >
            <label htmlFor="template-select" className="sr-only">
              {t('templateLabel')}
            </label>
            <select
              id="template-select"
              className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
            >
              <option value="">{t('templatePlaceholder')}</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  {tpl.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={createFromTemplate.isPending || !templateId}
              className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
            >
              {t('createFromTemplate')}
            </button>
          </form>
        )}
      </section>

      <aside>
        <h2 className="mb-4 text-lg font-semibold">{t('sprintsTitle')}</h2>
        <ul className="mb-4 space-y-2">
          {sprints.data?.map((sprint) => (
            <li key={sprint.id} className="rounded border border-border bg-surface-raised p-3 text-sm">
              <div className="mb-1 flex items-center justify-between">
                <span className="font-medium">{sprint.name}</span>
                <span className="rounded bg-surface px-1.5 py-0.5 text-xs text-text-secondary">
                  {sprint.status === 'active' && t('activeSprintBadge')}
                  {sprint.status === 'planned' && t('plannedSprintBadge')}
                  {sprint.status === 'completed' && t('completedSprintBadge')}
                </span>
              </div>
              {sprint.goal && <p className="mb-1 text-xs italic text-text-secondary">{t('sprintGoalPrefix')} {sprint.goal}</p>}
              {sprint.status === 'planned' && !activeSprint && (
                <button
                  onClick={() => startSprint.mutate(sprint.id)}
                  className="text-xs text-accent hover:underline"
                >
                  {t('startSprint')}
                </button>
              )}
              {sprint.status === 'active' && (
                <button
                  onClick={() => completeSprint.mutate(sprint.id)}
                  className="text-xs text-accent hover:underline"
                >
                  {t('completeSprint')}
                </button>
              )}
            </li>
          ))}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            createSprint.mutate(
              { name: sprintName, goal: sprintGoal || undefined },
              { onSuccess: () => { setSprintName(''); setSprintGoal(''); } },
            );
          }}
          className="flex flex-col gap-2"
        >
          <label htmlFor="sprint-name" className="sr-only">
            {t('sprintNamePlaceholder')}
          </label>
          <input
            id="sprint-name"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('sprintNamePlaceholder')}
            value={sprintName}
            onChange={(e) => setSprintName(e.target.value)}
            required
          />
          <label htmlFor="sprint-goal" className="sr-only">
            {t('sprintGoalPlaceholder')}
          </label>
          <input
            id="sprint-goal"
            className="flex-1 rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            placeholder={t('sprintGoalPlaceholder')}
            value={sprintGoal}
            onChange={(e) => setSprintGoal(e.target.value)}
          />
          <button
            type="submit"
            disabled={createSprint.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('createSprint')}
          </button>
        </form>
      </aside>
    </div>
  );
}
