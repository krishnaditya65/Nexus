import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './roles.decorator';

/**
 * Reads the @Roles(...) metadata off the target handler and checks it
 * against `req.user.role`, which JwtAuthGuard has already populated from the
 * verified JWT by the time this guard runs (NestJS evaluates guards in
 * array order, so @UseGuards(JwtAuthGuard, RolesGuard) — always in that
 * order, never reversed, or req.user won't exist yet).
 *
 * A route with no @Roles(...) decorator is allowed through unchanged —
 * this guard only restricts routes that explicitly opt in, matching the
 * fail-open-on-unconfigured stance used elsewhere in this platform (see
 * MeteringService.checkEntitlement's identical reasoning for entitlement
 * caps with no configured limit).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.get<string[] | undefined>(ROLES_KEY, context.getHandler());
    if (!requiredRoles || requiredRoles.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const userRole: string | undefined = req.user?.role;
    if (!userRole || !requiredRoles.includes(userRole)) {
      throw new ForbiddenException(
        `requires one of roles [${requiredRoles.join(', ')}], caller has '${userRole ?? 'none'}'`,
      );
    }
    return true;
  }
}
