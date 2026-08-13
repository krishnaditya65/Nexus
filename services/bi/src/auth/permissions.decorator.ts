import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'requiresPermission';

/** Declares which of the caller's JWT `permissions` claim (custom role
 *  builder, docs/FEATURES.md §11.1/§13.8) an endpoint requires. Pair with
 *  PermissionsGuard. Ported verbatim from services/pm's
 *  auth/permissions.decorator.ts — bi's second adopter of the custom
 *  role system, its first `@Roles`-independent one (bi has no
 *  roles.guard.ts/roles.decorator.ts of its own; every route here was
 *  JwtAuthGuard-only until this). */
export const RequiresPermission = (...permissions: string[]) => SetMetadata(REQUIRES_PERMISSION_KEY, permissions);
