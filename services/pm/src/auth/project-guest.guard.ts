import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { withTenant } from '../db/pool';
import { ProjectsService } from '../projects/projects.service';
import { GUEST_PROJECT_LOOKUP_KEY, GuestLookupTable } from './guest-project-lookup.decorator';

/**
 * §12.7 guest/external collaboration enforcement. A NON-guest request
 * passes through untouched — every existing tenant member keeps seeing
 * every project in their tenant, exactly as before this guard existed.
 * A GUEST request (`req.user.is_guest`, set by services/auth and
 * carried in the JWT) must resolve to a `projectId` — from the query
 * string (`?projectId=`) for list/graph/backlog-style routes, or looked
 * up from a `:id` route param against a fixed, decorator-selected table
 * (see `guest-project-lookup.decorator.ts`; defaults to `tickets` when
 * no `@GuestProjectLookup(...)` is present, preserving this guard's
 * original TicketsController-only behavior) — and the requesting user
 * must be an explicit `project_members` row for the resolved project.
 *
 * **Extended rollout (docs/FEATURES.md §12.7 fast-follow)**: originally
 * wired into `TicketsController` only. Now also applied to
 * `BoardsController.get`, `WikiController` (list/get/update/setPublic/
 * remove), and `ReleasesController` (list/get/setStatus/notes) — the
 * next-highest-traffic surfaces a project guest could reach. **Still
 * explicitly NOT** every one of pm's other modules (OKRs, dashboards,
 * forms admin, custom fields, workflow designer, roadmap, etc.) — same
 * scale-of-lift disclosure as §11.1's still-pending field/branch RBAC.
 * `ReleasesController.tagTicket` (keyed by `:ticketId`, not `:id`) is
 * also not covered by this guard's current param-name convention; it
 * remains an open gap alongside the rest.
 */
@Injectable()
export class ProjectGuestGuard implements CanActivate {
  constructor(
    private readonly projects: ProjectsService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.is_guest) return true;

    let projectId: string | null = req.query?.projectId ?? null;
    if (!projectId && req.params?.id) {
      const table: GuestLookupTable =
        this.reflector.get<GuestLookupTable>(GUEST_PROJECT_LOOKUP_KEY, context.getHandler()) ?? 'tickets';
      projectId = await withTenant(user.tenant_id, async (client) => {
        const { rows } = await client.query(`select project_id from ${table} where id = $1`, [req.params.id]);
        return rows[0]?.project_id ?? null;
      });
    }

    if (!projectId) {
      // A guest hitting a route this guard can't resolve a project for
      // (e.g. the bulk-update endpoint, which takes many ticket ids at
      // once) fails closed rather than silently passing unchecked.
      throw new ForbiddenException('Guests must scope this action to a single project');
    }

    const isMember = await this.projects.isMember(user.tenant_id, projectId, user.sub);
    if (!isMember) throw new ForbiddenException('You are not a member of this project');
    return true;
  }
}
