import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const VALID_CATEGORIES = new Set(['went_well', 'went_poorly', 'action_item']);

@Injectable()
export class RetrospectivesService {
  async create(tenantId: string, projectId: string, title: string, sprintId: string | null, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into retrospectives (tenant_id, project_id, sprint_id, title, created_by_user_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, projectId, sprintId, title, userId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from retrospectives where project_id = $1 order by created_at desc`,
        [projectId],
      );
      return rows;
    });
  }

  /** Returns the retro plus its items grouped by category — exactly the
   *  shape the three-column board UI renders directly, no client-side
   *  grouping needed. */
  async getWithItems(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const retroRes = await client.query(`select * from retrospectives where id = $1`, [id]);
      const retro = retroRes.rows[0];
      if (!retro) throw new NotFoundException('Retrospective not found');

      const itemsRes = await client.query(
        `select * from retrospective_items where retrospective_id = $1 order by created_at`,
        [id],
      );
      const items = { went_well: [], went_poorly: [], action_item: [] } as Record<string, unknown[]>;
      for (const item of itemsRes.rows) {
        items[item.category].push(item);
      }
      return { ...retro, items };
    });
  }

  async addItem(tenantId: string, retrospectiveId: string, category: string, content: string, userId: string) {
    if (!VALID_CATEGORIES.has(category)) {
      throw new BadRequestException(`Invalid category: ${category}`);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into retrospective_items (tenant_id, retrospective_id, category, content, author_user_id)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, retrospectiveId, category, content, userId],
      );
      return rows[0];
    });
  }

  async removeItem(tenantId: string, itemId: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from retrospective_items where id = $1`, [itemId]);
      if (!rowCount) throw new NotFoundException('Item not found');
      return { status: 'deleted' };
    });
  }

  async close(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update retrospectives set status = 'closed' where id = $1 returning *`,
        [id],
      );
      if (!rows[0]) throw new NotFoundException('Retrospective not found');
      return rows[0];
    });
  }
}
