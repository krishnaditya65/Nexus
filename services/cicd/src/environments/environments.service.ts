import { BadRequestException, Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class EnvironmentsService {
  async create(tenantId: string, repoName: string, name: string, requiresApproval: boolean) {
    return withTenant(tenantId, async (client) => {
      const posRes = await client.query(
        `select coalesce(max(position), -1) + 1 as next from environments where repo_name = $1`,
        [repoName],
      );
      const { rows } = await client.query(
        `insert into environments (tenant_id, repo_name, name, position, requires_approval)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, repoName, name, posRes.rows[0].next, requiresApproval],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, repoName: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from environments where repo_name = $1 order by position`,
        [repoName],
      );
      return rows;
    });
  }

  async createFreezeWindow(tenantId: string, environmentId: string, reason: string, startsAt: string, endsAt: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into freeze_windows (tenant_id, environment_id, reason, starts_at, ends_at)
         values ($1, $2, $3, $4, $5) returning *`,
        [tenantId, environmentId, reason, startsAt, endsAt],
      );
      return rows[0];
    });
  }

  async listFreezeWindows(tenantId: string, environmentId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from freeze_windows where environment_id = $1 order by starts_at desc`,
        [environmentId],
      );
      return rows;
    });
  }

  /** Whether right now falls inside any freeze window for this
   *  environment — what DeploymentsService checks before accepting a
   *  deployment request. Exposed as its own method (not just inlined into
   *  the deployment-request path) so a "can I deploy right now?" UI check
   *  can call it directly without attempting a request first. */
  async isFrozen(tenantId: string, environmentId: string): Promise<{ frozen: boolean; reason?: string; endsAt?: string }> {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select reason, ends_at from freeze_windows
         where environment_id = $1 and starts_at <= now() and ends_at > now()
         order by ends_at desc limit 1`,
        [environmentId],
      );
      if (!rows[0]) return { frozen: false };
      return { frozen: true, reason: rows[0].reason, endsAt: rows[0].ends_at };
    });
  }

  async assertNotFrozen(tenantId: string, environmentId: string) {
    const status = await this.isFrozen(tenantId, environmentId);
    if (status.frozen) {
      throw new BadRequestException(
        `Environment is in a freeze window ("${status.reason}") until ${status.endsAt} — deployments are blocked.`,
      );
    }
  }
}
