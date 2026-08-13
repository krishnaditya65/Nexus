// Wraps auth's tenant-scoped user list — used wherever a screen needs to
// resolve a user id to a display name (Team Planner) or let someone pick
// a teammate (assignee dropdowns, capacity entry, Permissions settings).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '../api-client';
import { SERVICE_URLS } from '../service-urls';

export type Role = 'owner' | 'admin' | 'member';

export interface TenantUser {
  id: string;
  email: string;
  display_name: string;
  role: Role;
  is_guest?: boolean;
  custom_role_id?: string | null;
}

export function useTenantUsers() {
  return useQuery<TenantUser[], ApiError>({
    queryKey: ['tenantUsers'],
    queryFn: () => apiFetch(SERVICE_URLS.auth, '/users'),
  });
}

/** §12.7 — creates a tenant user with `is_guest = true`. On its own this
 *  grants no project access at all; see use-project-members.ts's
 *  useAddProjectMember for the second, separate step that actually
 *  scopes them to a project. */
export function useInviteGuest() {
  const qc = useQueryClient();
  return useMutation<TenantUser, ApiError, { email: string; password: string; displayName: string }>({
    mutationFn: (body) => apiFetch(SERVICE_URLS.auth, '/users/invite-guest', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenantUsers'] }),
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation<TenantUser, ApiError, { userId: string; role: Role }>({
    mutationFn: ({ userId, role }) =>
      apiFetch(SERVICE_URLS.auth, `/users/${userId}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['tenantUsers'] }),
  });
}
