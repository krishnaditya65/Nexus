import { SetMetadata } from '@nestjs/common';

export const ROLES_KEY = 'roles';

/** Declares which of `users.role` ('owner' | 'admin' | 'member') may call an
 *  endpoint. Pair with RolesGuard, which reads this metadata off the route.
 *  This is deliberately coarse (role-level, not the field/branch/budget-level
 *  grants the original spec describes) — see docs/ROADMAP.md Track 1 for the
 *  finer-grained permission layer this is the foundation for, not the
 *  finished version of. */
export const Roles = (...roles: Array<'owner' | 'admin' | 'member'>) => SetMetadata(ROLES_KEY, roles);
