import { Injectable } from '@nestjs/common';
import { withTenant } from '../db/pool';

@Injectable()
export class PipelinesService {
  async create(
    tenantId: string,
    repoName: string,
    name: string,
    yamlDefinition: string,
    triggerEventTypes: string[],
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into pipelines (tenant_id, repo_name, name, yaml_definition, trigger_event_types)
         values ($1, $2, $3, $4, $5)
         on conflict (tenant_id, repo_name, name) do update
           set yaml_definition = excluded.yaml_definition, trigger_event_types = excluded.trigger_event_types
         returning *`,
        [tenantId, repoName, name, yamlDefinition, triggerEventTypes],
      );
      return rows[0];
    });
  }

  async list(tenantId: string, repoName: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from pipelines where tenant_id = $1 and repo_name = $2 order by created_at desc`,
        [tenantId, repoName],
      );
      return rows;
    });
  }

  async get(tenantId: string, pipelineId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from pipelines where id = $1`, [pipelineId]);
      return rows[0] ?? null;
    });
  }

  /** Matches pipelines whose trigger_event_types include eventType — used
   *  by the (currently manual-trigger-only) webhook-driven trigger path;
   *  see docs/ROADMAP.md for wiring this to api-platform's webhook delivery. */
  async findByTriggerEvent(tenantId: string, repoName: string, eventType: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from pipelines where tenant_id = $1 and repo_name = $2 and $3 = any(trigger_event_types)`,
        [tenantId, repoName, eventType],
      );
      return rows;
    });
  }
}
