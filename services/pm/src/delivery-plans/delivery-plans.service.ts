import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class DeliveryPlansService {
  async create(tenantId: string, name: string, projectIds: string[], userId: string) {
    if (!Array.isArray(projectIds) || projectIds.length === 0) {
      throw new BadRequestException('projectIds must be a non-empty array');
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into delivery_plans (tenant_id, name, project_ids, created_by_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, name, projectIds, userId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from delivery_plans where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  /**
   * The actual cross-project timeline: every sprint (start_date/end_date/
   * status) belonging to any project on this plan, joined with the
   * project's key/name so the UI can group/label lanes per project. Only
   * sprints with both dates set are date-plottable — undated sprints are
   * still returned (a real "Backlog"-only project has these) but flagged
   * so the UI can render them in an unscheduled list instead of dropping
   * them silently.
   */
  async generate(tenantId: string, planId: string) {
    return withTenant(tenantId, async (client) => {
      const planRes = await client.query(`select * from delivery_plans where id = $1`, [planId]);
      const plan = planRes.rows[0];
      if (!plan) throw new NotFoundException('Delivery plan not found');

      const { rows: sprints } = await client.query(
        `select s.id, s.name, s.status, s.start_date, s.end_date, p.id as project_id, p.key as project_key, p.name as project_name
         from sprints s
         join projects p on p.id = s.project_id
         where s.project_id = any($1)
         order by p.key, s.start_date nulls last, s.created_at`,
        [plan.project_ids],
      );

      return {
        plan,
        lanes: sprints.map((s) => ({
          sprintId: s.id,
          sprintName: s.name,
          status: s.status,
          startDate: s.start_date,
          endDate: s.end_date,
          scheduled: s.start_date !== null && s.end_date !== null,
          projectId: s.project_id,
          projectKey: s.project_key,
          projectName: s.project_name,
        })),
      };
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from delivery_plans where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('Delivery plan not found');
      return { status: 'deleted' };
    });
  }
}
