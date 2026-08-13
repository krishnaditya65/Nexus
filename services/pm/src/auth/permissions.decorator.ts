import { SetMetadata } from '@nestjs/common';

export const REQUIRES_PERMISSION_KEY = 'requiresPermission';

/** Declares which of the caller's JWT `permissions` claim (custom role
 *  builder, docs/FEATURES.md §11.1/§13.8) an endpoint requires, on top of
 *  the coarse `role.decorator.ts` enum. Pair with PermissionsGuard. */
export const RequiresPermission = (...permissions: string[]) =>
  SetMetadata(REQUIRES_PERMISSION_KEY, permissions);
