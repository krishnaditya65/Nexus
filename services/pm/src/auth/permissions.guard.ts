import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { REQUIRES_PERMISSION_KEY } from './permissions.decorator';

/**
 * Custom role builder's enforcement point (docs/FEATURES.md §11.1/§13.8) —
 * the reference integration for the platform's first service. Reads the
 * caller's `permissions` claim (embedded at JWT-issue time by
 * services/auth's AuthService.issueToken, resolved from their assigned
 * custom role, empty array if they have none) and checks it against the
 * `@RequiresPermission(...)` metadata on the target handler.
 *
 * Deliberately layered ON TOP of the existing role.guard.ts, not a
 * replacement: an 'owner' or 'admin' always passes regardless of their
 * `permissions` claim — a custom role is an ADDITIVE grant that lets a
 * plain 'member' reach one specific capability without becoming an admin,
 * never a way to restrict what owner/admin already have. This is what
 * makes it safe to swap onto an existing @Roles('owner','admin') route:
 * zero behavior change for every existing owner/admin caller, and a
 * strictly new capability opens up for whoever an owner grants the
 * matching permission to.
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
