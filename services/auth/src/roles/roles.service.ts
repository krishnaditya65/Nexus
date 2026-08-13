import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

/**
 * The platform's fixed catalog of grantable permissions. A custom role is
 * always a subset of this list, never a free-form string — that's the
 * difference between a real permission system and a UI that just LOOKS
 * like one. Deliberately not exhaustive (§13.8 disclosed scope): covers
 * the highest-traffic gated actions across pm/bi/cicd as the reference
 * set; adding a permission for a new gated action elsewhere is a one-line
 * addition here plus wiring that service's own PermissionsGuard, same
 * mechanical rollout shape as §11.9's API-key guard adoption.
 */
export const PERMISSIONS = [
  'tickets.create',
  'tickets.transition',
  'tickets.delete',
  'boards.manage',
  'automations.manage',
  'forms.manage',
  'budget.view',
  'budget.edit',
  'fields.view_restricted',
  'pipelines.approve',
  'pipelines.manage',
  'repos.admin',
  'users.manage',
  'roles.manage',
  'billing.manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  permissions: string[];
  created_at: string;
}

function assertValidPermissions(permissions: string[]) {
  const unknown = permissions.filter((p) => !(PERMISSIONS as readonly string[]).includes(p));
  if (unknown.length > 0) {
    throw new BadRequestException(`Unknown permission(s): ${unknown.join(', ')}`);
  }
}

@Injectable()
export class RolesService {
  async create(tenantId: string, name: string, permissions: string[]): Promise<Role> {
    assertValidPermissions(permissions);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query<Role>(
        `insert into roles (tenant_id, name, permissions) values ($1, $2, $3) returning *`,
        [tenantId, name, permissions],
      );
      return rows[0];
    });
  }

  async list(tenantId: string): Promise<Role[]> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query<Role>(`select * from roles where tenant_id = $1 order by name`, [
        tenantId,
      ]);
      return rows;
    });
  }

  async findById(tenantId: string, id: string): Promise<Role | null> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query<Role>(`select * from roles where tenant_id = $1 and id = $2`, [
        tenantId,
        id,
      ]);
      return rows[0] ?? null;
    });
  }

  async update(tenantId: string, id: string, updates: { name?: string; permissions?: string[] }): Promise<Role> {
    if (updates.permissions) assertValidPermissions(updates.permissions);
    return withTenant(tenantId, async (client) => {
      const existing = await client.query<Role>(`select * from roles where tenant_id = $1 and id = $2`, [
        tenantId,
        id,
      ]);
      if (!existing.rows[0]) throw new NotFoundException('Role not found');
      const { rows } = await client.query<Role>(
        `update roles set name = $1, permissions = $2 where tenant_id = $3 and id = $4 returning *`,
        [updates.name ?? existing.rows[0].name, updates.permissions ?? existing.rows[0].permissions, tenantId, id],
      );
      return rows[0];
    });
  }

  /** Users holding this role fall back to their ordinary owner/admin/member
   *  enum automatically — `users.custom_role_id` has `ON DELETE SET NULL`,
   *  so removing a role can never leave a dangling reference or a user
   *  stuck in a broken permission state. */
  async remove(tenantId: string, id: string): Promise<{ deleted: boolean }> {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from roles where tenant_id = $1 and id = $2`, [tenantId, id]);
      return { deleted: (rowCount ?? 0) > 0 };
    });
  }
}
