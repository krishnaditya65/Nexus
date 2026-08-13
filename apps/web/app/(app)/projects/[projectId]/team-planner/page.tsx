'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useSprints } from '@/lib/hooks/use-backlog';
import { useTeamPlan, useSetCapacity } from '@/lib/hooks/use-team-planner';
import { useTenantUsers } from '@/lib/hooks/use-tenant-users';

export default function TeamPlannerPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('teamPlanner');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: sprints } = useSprints(projectId);
  const [sprintId, setSprintId] = useState<string>('');
  const activeSprintId = sprintId || sprints?.[0]?.id || '';

  const { data: plan, isLoading, error } = useTeamPlan(activeSprintId || null);
  const { data: users } = useTenantUsers();
  const setCapacity = useSetCapacity(activeSprintId || null);

  const [capacityDrafts, setCapacityDrafts] = useState<Record<string, string>>({});

  function displayName(userId: string) {
    return users?.find((u) => u.id === userId)?.display_name ?? userId.slice(0, 8);
  }

  // Every tenant user gets a capacity-entry row, not just people who
  // already have allocated tickets — a planner needs to set capacity for
  // someone *before* assigning them work, not only after.
  const rows = (users ?? []).map((user) => {
    const existing = plan?.find((p) => p.userId === user.id);
    return (
      existing ?? {
        userId: user.id,
        capacityPoints: 0,
        allocatedPoints: 0,
        ticketCount: 0,
        isOverallocated: false,
      }
    );
  });

  return (
    <div className="mx-auto max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <select
          className="rounded border border-border bg-surface-raised px-2 py-1 text-sm"
          value={activeSprintId}
          onChange={(e) => setSprintId(e.target.value)}
        >
          {sprints?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      </div>

      {!activeSprintId && <p className="text-text-secondary">{t('noSprint')}</p>}
      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      {activeSprintId && (
        <table className="w-full rounded border border-border text-sm">
          <thead>
            <tr className="border-b border-border text-left text-text-secondary">
              <th className="px-3 py-2 font-medium">{t('person')}</th>
              <th className="px-3 py-2 font-medium">{t('capacity')}</th>
              <th className="px-3 py-2 font-medium">{t('allocated')}</th>
              <th className="px-3 py-2 font-medium">{t('tickets')}</th>
              <th className="px-3 py-2 font-medium">{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.userId} className="border-b border-border last:border-0">
                <td className="px-3 py-2">{displayName(row.userId)}</td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    <label htmlFor={`capacity-${row.userId}`} className="sr-only">
                      {t('capacity')}
                    </label>
                    <input
                      id={`capacity-${row.userId}`}
                      className="w-16 rounded border border-border bg-surface-raised px-1.5 py-0.5"
                      value={capacityDrafts[row.userId] ?? row.capacityPoints}
                      onChange={(e) => setCapacityDrafts((prev) => ({ ...prev, [row.userId]: e.target.value }))}
                    />
                    <button
                      className="text-xs text-accent hover:underline"
                      onClick={() => {
                        const value = Number(capacityDrafts[row.userId] ?? row.capacityPoints);
                        if (Number.isNaN(value)) return;
                        setCapacity.mutate({ userId: row.userId, capacityPoints: value });
                      }}
                    >
                      {tCommon('save')}
                    </button>
                  </div>
                </td>
                <td className="px-3 py-2">{row.allocatedPoints}</td>
                <td className="px-3 py-2">{row.ticketCount}</td>
                <td className="px-3 py-2">
                  {row.isOverallocated ? (
                    <span className="rounded bg-danger/20 px-2 py-0.5 text-xs text-danger">{t('overallocated')}</span>
                  ) : (
                    <span className="rounded bg-success/20 px-2 py-0.5 text-xs text-success">{t('withinCapacity')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
