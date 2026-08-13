'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { useTenantUsers, useSetUserRole, Role } from '@/lib/hooks/use-tenant-users';
import {
  usePermissionsCatalog,
  useCustomRoles,
  useCreateCustomRole,
  useDeleteCustomRole,
  useSetUserCustomRole,
} from '@/lib/hooks/use-custom-roles';
import { useAuthStore } from '@/lib/auth-store';
import { SettingsNav } from '@/components/settings-nav';

const ROLES: Role[] = ['owner', 'admin', 'member'];
const NO_CUSTOM_ROLE = '__none__';

export default function PermissionsSettingsPage() {
  const t = useTranslations('settings');
  const tCommon = useTranslations('common');
  const { data: users, isLoading, error } = useTenantUsers();
  const setRole = useSetUserRole();
  const currentUserId = useAuthStore((s) => s.claims?.sub);

  const { data: catalog } = usePermissionsCatalog();
  const { data: customRoles } = useCustomRoles();
  const createRole = useCreateCustomRole();
  const deleteRole = useDeleteCustomRole();
  const setUserCustomRole = useSetUserCustomRole();

  const [newRoleName, setNewRoleName] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>([]);

  return (
    <div className="mx-auto max-w-2xl">
      <SettingsNav />
      <h1 className="mb-1 text-xl font-semibold">{t('permissionsTitle')}</h1>
      <p className="mb-6 text-sm text-text-secondary">{t('permissionsSubtitle')}</p>

      {isLoading && <p className="text-text-secondary">{tCommon('loading')}</p>}
      {error && <p className="text-danger">{tCommon('errorGeneric', { message: error.message })}</p>}

      <ul className="mb-10 divide-y divide-border rounded border border-border">
        {users?.map((u) => (
          <li key={u.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
            <div>
              <p className="font-medium">{u.display_name}</p>
              <p className="text-text-secondary">{u.email}</p>
            </div>
            <div className="flex items-center gap-2">
              {u.id === currentUserId ? (
                <span className="rounded bg-surface-raised px-2 py-1 text-xs text-text-secondary">{u.role}</span>
              ) : (
                <>
                  <label>
                    <span className="sr-only">{t('roleLabel')}</span>
                    <select
                      className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                      value={u.role}
                      onChange={(e) => setRole.mutate({ userId: u.id, role: e.target.value as Role })}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">{t('customRoleLabel')}</span>
                    <select
                      className="rounded border border-border bg-surface-raised px-2 py-1 text-xs"
                      value={u.custom_role_id ?? NO_CUSTOM_ROLE}
                      onChange={(e) =>
                        setUserCustomRole.mutate({
                          userId: u.id,
                          customRoleId: e.target.value === NO_CUSTOM_ROLE ? null : e.target.value,
                        })
                      }
                    >
                      <option value={NO_CUSTOM_ROLE}>{t('noCustomRole')}</option>
                      {customRoles?.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </>
              )}
            </div>
          </li>
        ))}
      </ul>

      <section>
        <h2 className="mb-1 text-lg font-semibold">{t('customRolesHeading')}</h2>
        <p className="mb-3 text-xs text-text-secondary">{t('customRolesExplainer')}</p>

        <form
          className="mb-3 rounded border border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            createRole.mutate(
              { name: newRoleName, permissions: newRolePerms },
              { onSuccess: () => { setNewRoleName(''); setNewRolePerms([]); } },
            );
          }}
        >
          <label className="mb-1 block text-xs font-medium text-text-secondary">{t('roleNameLabel')}</label>
          <input
            className="mb-3 w-full rounded border border-border bg-surface-raised px-2 py-1.5 text-sm"
            value={newRoleName}
            onChange={(e) => setNewRoleName(e.target.value)}
            required
          />
          <p className="mb-1 text-xs font-medium text-text-secondary">{t('permissionsLabel')}</p>
          <div className="mb-3 grid grid-cols-2 gap-1">
            {catalog?.map((perm) => (
              <label key={perm} className="flex items-center gap-1.5 text-xs">
                <input
                  type="checkbox"
                  checked={newRolePerms.includes(perm)}
                  onChange={(e) =>
                    setNewRolePerms((prev) =>
                      e.target.checked ? [...prev, perm] : prev.filter((p) => p !== perm),
                    )
                  }
                />
                {perm}
              </label>
            ))}
          </div>
          {createRole.isError && <p className="mb-3 text-xs text-danger">{createRole.error.message}</p>}
          <button
            type="submit"
            disabled={createRole.isPending}
            className="rounded bg-accent px-3 py-1.5 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            {t('createRoleButton')}
          </button>
        </form>

        <ul className="divide-y divide-border rounded border border-border">
          {customRoles?.length === 0 && <li className="px-4 py-3 text-sm text-text-secondary">{t('emptyCustomRoles')}</li>}
          {customRoles?.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <p className="font-medium">{r.name}</p>
                <p className="text-xs text-text-secondary">{r.permissions.join(', ') || t('noPermissions')}</p>
              </div>
              <button
                onClick={() => deleteRole.mutate(r.id)}
                disabled={deleteRole.isPending}
                className="rounded border border-danger px-2 py-1 text-xs text-danger hover:bg-danger/10 disabled:opacity-50"
              >
                {tCommon('remove')}
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
