import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const GOAL_TYPES = ['numeric', 'currency', 'task_count'];

/**
 * Lightweight Goals (docs/FEATURES.md §12.5) — a single target number
 * with a progress bar, deliberately without §11.7 OKRs' Objective/Key-
 * Result ceremony or epic auto-rollup. Always manually updated; a
 * tenant that wants automatic progress from real ticket completion
 * already has OKRs' epic-linked key results for that.
 */
@Injectable()
export class GoalsService {
  async create(
    tenantId: string,
    projectId: string,
    name: string,
    goalType: string,
    targetValue: number,
    unit: string,
    ownerUserId: string | null,
    dueDate: string | null,
    createdByUserId: string,
  ) {
    if (!GOAL_TYPES.includes(goalType)) throw new BadRequestException(`Unknown goal type: ${goalType}`);
    if (targetValue <= 0) throw new BadRequestException('targetValue must be positive');
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into goals (tenant_id, project_id, name, goal_type, target_value, unit, owner_user_id, due_date, created_by_user_id)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *`,
        [tenantId, projectId, name, goalType, targetValue, unit, ownerUserId, dueDate, createdByUserId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from goals where project_id = $1 order by created_at desc`, [projectId]);
      return rows.map((g) => ({
        ...g,
        progressPercent: Math.min(100, Math.round((Number(g.current_value) / Number(g.target_value)) * 100)),
      }));
    });
  }

  async updateValue(tenantId: string, id: string, currentValue: number) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update goals set current_value = $1 where id = $2 returning *`,
        [currentValue, id],
      );
      if (!rows[0]) throw new NotFoundException('Goal not found');
      // Auto-mark achieved the moment current reaches target — a real,
      // felt "you did it" moment rather than a status field the user has
      // to remember to flip themselves.
      if (Number(rows[0].current_value) >= Number(rows[0].target_value) && rows[0].status === 'active') {
        const achieved = await client.query(`update goals set status = 'achieved' where id = $1 returning *`, [id]);
        return achieved.rows[0];
      }
      return rows[0];
    });
  }

  async setStatus(tenantId: string, id: string, status: string) {
    if (!['active', 'achieved', 'archived'].includes(status)) throw new BadRequestException(`Unknown status: ${status}`);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`update goals set status = $1 where id = $2 returning *`, [status, id]);
      if (!rows[0]) throw new NotFoundException('Goal not found');
      return rows[0];
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from goals where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('Goal not found');
      return { status: 'deleted' };
    });
  }
}
