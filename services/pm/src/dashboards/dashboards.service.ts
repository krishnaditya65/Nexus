import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

// Mirrors the DB check constraint in 008_dashboards.sql — kept as its own
// TS whitelist (not derived from the DB at runtime) so an invalid type is
// rejected with a clear 400 before ever reaching a query, same pattern as
// queries' field whitelist and retrospectives' category whitelist.
const WIDGET_TYPES = new Set([
  'ticket_counts_by_state',
  'sprint_burndown',
  'open_pull_requests',
  'flaky_tests',
  'team_capacity',
  'velocity_trend',
]);

@Injectable()
export class DashboardsService {
  async create(tenantId: string, projectId: string, name: string, userId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into dashboards (tenant_id, project_id, name, created_by_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, projectId, name, userId],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, projectId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from dashboards where project_id = $1 order by created_at`,
        [projectId],
      );
      return rows;
    });
  }

  async getWithWidgets(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const dashboardRes = await client.query(`select * from dashboards where id = $1`, [id]);
      const dashboard = dashboardRes.rows[0];
      if (!dashboard) throw new NotFoundException('Dashboard not found');

      const widgetsRes = await client.query(
        `select * from dashboard_widgets where dashboard_id = $1 order by position`,
        [id],
      );
      return { ...dashboard, widgets: widgetsRes.rows };
    });
  }

  async addWidget(
    tenantId: string,
    dashboardId: string,
    widgetType: string,
    title: string,
    config: Record<string, unknown>,
  ) {
    if (!WIDGET_TYPES.has(widgetType)) {
      throw new BadRequestException(`Unknown widget type: ${widgetType}`);
    }
    return withTenant(tenantId, async (client) => {
      const posRes = await client.query(
        `select coalesce(max(position), -1) + 1 as next from dashboard_widgets where dashboard_id = $1`,
        [dashboardId],
      );
      const { rows } = await client.query(
        `insert into dashboard_widgets (tenant_id, dashboard_id, widget_type, title, position, config)
         values ($1, $2, $3, $4, $5, $6) returning *`,
        [tenantId, dashboardId, widgetType, title, posRes.rows[0].next, JSON.stringify(config)],
      );
      return rows[0];
    });
  }

  async removeWidget(tenantId: string, widgetId: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from dashboard_widgets where id = $1`, [widgetId]);
      if (!rowCount) throw new NotFoundException('Widget not found');
      return { status: 'deleted' };
    });
  }

  async remove(tenantId: string, id: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(`delete from dashboards where id = $1`, [id]);
      if (!rowCount) throw new NotFoundException('Dashboard not found');
      return { status: 'deleted' };
    });
  }
}
