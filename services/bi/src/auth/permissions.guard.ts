import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PERMISSION_KEY } from './permissions.decorator';

/**
 * Budget/financial-data visibility RBAC (docs/FEATURES.md §11.1) — bi's
 * adoption of the custom role builder's enforcement pattern (ported
 * verbatim from services/pm's permissions.guard.ts; see that file's
 * docblock for the full design rationale). `owner`/`admin` always pass —
 * a custom role only ever ADDS a capability to a plain member, never
 * restricts what owner/admin already have.
 *
 * This is bi's FIRST role/permission check of any kind — every route in
 * this service was `@UseGuards(JwtAuthGuard)`-only before (any
 * authenticated tenant member could read cost-report/rate-cards data);
 * gating `budget.view`/`budget.edit` here is what actually closes the
 * "a role that can see ticket status but not its logged-cost/budget-burn
 * data" gap — the ticket's own state stays visible via pm's ordinary
 * ticket read (unaffected), only THIS service's cost/rate endpoints now
 * require the permission.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.get<string[] | undefined>(REQUIRES_PERMISSION_KEY, context.getHandler());
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const userRole: string | undefined = req.user?.role;
    if (userRole === 'owner' || userRole === 'admin') return true;

    const granted: string[] = req.user?.permissions ?? [];
    const missing = required.filter((p) => !granted.includes(p));
    if (missing.length > 0) {
      throw new ForbiddenException(`requires permission(s) [${missing.join(', ')}]`);
    }
    return true;
  }
}
