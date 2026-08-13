import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';
import { buildFilterClause, Filter } from './filter-builder';

@Injectable()
export class QueriesService {
  async create(
    tenantId: string,
    projectId: string | null,
    name: string,
    filters: Filter[],
    createdByUserId: string,
    viewType: string = 'list',
    groupBy: string | null = null,
  ) {
    // Validate the filter shape up front (buildFilterClause throws
    // BadRequestException on an unknown field/operator) so a save never
    // stores a filter set that would fail every time it's later executed.
    buildFilterClause(filters, 0);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into saved_queries (tenant_id, project_id, name, filters, created_by_user_id, view_type, group_by)
         values ($1, $2, $3, $4, $5, $6, $7) returning *`,
        [tenantId, projectId, name, JSON.stringify(filters), createdByUserId, viewType, groupBy],
      );
      return rows[0];
    });
  }

  /** Changes an existing saved query/view's shape (name, filters,
   *  viewType, groupBy) in place — switching a saved List view to
   *  Calendar, say, without losing its filters or having to recreate it
   *  under a new id (§12.1's multi-view engine: the same saved_queries
   *  row IS the "view", just rendered differently client-side). */
  async update(
    tenantId: string,
    id: string,
    requestingUserId: string,
    patch: { name?: string; filters?: Filter[]; viewType?: string; groupBy?: string | null },
  ) {
    if (patch.filters) buildFilterClause(patch.filters, 0);
    return withTenant(tenantId, async (client) => {
      const { rows: existing } = await client.query(`select * from saved_queries where id = $1`, [id]);
      const query = existing[0];
      if (!query) throw new NotFoundException('Query not found');
      if (query.created_by_user_id !== requestingUserId) {
        throw new ForbiddenException('Only the query author can edit it');
      }
      const { rows } = await client.query(
        `update saved_queries set
           name = coalesce($1, name),
           filters = coalesce($2, filters),
           view_type = coalesce($3, view_type),
           group_by = $4
         where id = $5 returning *`,
        [
          patch.name ?? null,
          patch.filters ? JSON.stringify(patch.filters) : null,
          patch.viewType ?? null,
          patch.groupBy !== undefined ? patch.groupBy : query.group_by,
          id,
        ],
      );
      return rows[0];
    });
  }

  /** Lists saved queries visible in this project — the project's own
   *  scoped queries plus any cross-project ("project_id is null") ones,
   *  same "global + scoped" pattern as Jira's shared filters. */
  async list(tenantId: string, projectId: string | null) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from saved_queries
         where tenant_id = $1 and (project_id = $2 or ($2 is null and project_id is null) or project_id is null)
         order by created_at desc`,
        [tenantId, projectId],
      );
      return rows;
    });
  }

  async remove(tenantId: string, id: string, requestingUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from saved_queries where id = $1`, [id]);
      const query = rows[0];
      if (!query) throw new NotFoundException('Query not found');
      if (query.created_by_user_id !== requestingUserId) {
        // Only the author can delete their own saved query — same "you
        // can't delete someone else's shared filter" rule Jira enforces.
        throw new ForbiddenException('Only the query author can delete it');
      }
      await client.query(`delete from saved_queries where id = $1`, [id]);
      return { status: 'deleted' };
    });
  }

  /** Runs a filter set (ad hoc, or loaded from a saved query) against
   *  `tickets`, scoped to a project. Joins workflow_states so results
   *  carry a human-readable state name, not just state_id. */
  async execute(tenantId: string, projectId: string, filters: Filter[]) {
    const { sql: filterSql, params: filterParams } = buildFilterClause(filters, 1);
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select t.*, ws.name as state_name
         from tickets t
         join workflow_states ws on ws.id = t.state_id
         where t.project_id = $1 ${filterSql ? `and ${filterSql}` : ''}
         order by t.due_date nulls last, t.ticket_number desc
         limit 200`,
        [projectId, ...filterParams],
      );
      return rows;
    });
  }

  async executeSaved(tenantId: string, queryId: string, projectId: string) {
    const [query] = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from saved_queries where id = $1`, [queryId]);
      return rows;
    });
    if (!query) throw new NotFoundException('Query not found');
    return this.execute(tenantId, projectId, query.filters as Filter[]);
  }
}
