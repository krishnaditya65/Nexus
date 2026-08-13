'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useProjectMembers, useAddProjectMember, useRemoveProjectMember } from '@/lib/hooks/use-project-members';
import { useTenantUsers, useInviteGuest } from '@/lib/hooks/use-tenant-users';

export default function ProjectMembersPage({ params }: { params: { projectId: string } }) {
  const t = useTranslations('projectMembers');
  const tCommon = useTranslations('common');
  const projectId = params.projectId;

  const { data: members, isLoading } = useProjectMembers(projectId);
  const addMember = useAddProjectMember(projectId);
  const removeMember = useRemoveProjectMember(projectId);
  const { data: tenantUsers } = useTenantUsers();
  const inviteGuest = useInviteGuest();

  const [existingUserId, setExistingUserId] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [guestPassword, setGuestPassword] = useState('');
  const [guestName, setGuestName] = useState('');

  const userById = new Map((tenantUsers ?? []).map((u) => [u.id, u]));

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-1 text-xl font-semibold">{t('title')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('subtitle')}</p>

      <section className="mb-6 rounded border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">{t('addExistingHeading')}</h2>
        <div className="flex gap-2">
          <select
            value={existingUserId}
            onChange={(e) => setExistingUserId(e.target.value)}
            className="flex-1 rounded border border-border bg-surface px-2 py-1.5 text-sm"
          >
            <option value="">{t('selectUser')}</option>
            {tenantUsers?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.display_name || u.email} {u.is_guest ? `(${t('guestBadge')})` : ''}
              </option>
            ))}
          </select>
          <button
            disabled={!existingUserId || addMember.isPending}
            onClick={() => addMember.mutate(existingUserId, { onSuccess: () => setExistingUserId('') })}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('addButton')}
          </button>
        </div>
      </section>

      <section className="mb-6 rounded border border-border p-4">
        <h2 className="mb-2 text-sm font-medium">{t('inviteGuestHeading')}</h2>
        <p className="mb-3 text-xs text-text-secondary">{t('inviteGuestExplainer')}</p>
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            inviteGuest.mutate(
              { email: guestEmail, password: guestPassword, displayName: guestName },
              {
                onSuccess: (user) => {
                  addMember.mutate(user.id);
                  setGuestEmail('');
                  setGuestPassword('');
                  setGuestName('');
                },
              },
            );
          }}
        >
          <div className="grid grid-cols-3 gap-2">
            <input
              placeholder={t('guestNamePlaceholder')}
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
              required
            />
            <input
              type="email"
              placeholder={t('guestEmailPlaceholder')}
              value={guestEmail}
              onChange={(e) => setGuestEmail(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
              required
            />
            <input
              type="password"
              placeholder={t('guestPasswordPlaceholder')}
              value={guestPassword}
              onChange={(e) => setGuestPassword(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1.5 text-sm"
              required
            />
          </div>
          {inviteGuest.isError && <p className="text-xs text-danger">{inviteGuest.error.message}</p>}
          <button
            type="submit"
            disabled={inviteGuest.isPending}
            className="rounded border border-border px-3 py-1.5 text-sm hover:bg-surface-raised disabled:opacity-50"
          >
            {t('inviteGuestButton')}
          </button>
        </form>
      </section>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}

      <ul className="divide-y divide-border rounded border border-border">
        {members?.map((m) => {
          const user = userById.get(m.user_id);
          return (
            <li key={m.user_id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span>
                {user?.display_name || user?.email || m.user_id}
                {user?.is_guest && (
                  <span className="ml-2 rounded bg-surface-raised px-1.5 py-0.5 text-xs text-text-secondary">
                    {t('guestBadge')}
                  </span>
                )}
              </span>
              <button
                onClick={() => removeMember.mutate(m.user_id)}
                className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10"
              >
                {tCommon('remove')}
              </button>
            </li>
          );
        })}
        {members?.length === 0 && <li className="px-4 py-3 text-text-secondary">{t('empty')}</li>}
      </ul>
    </div>
  );
}
