import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { pool, withTenant } from '../db/pool';
import { runConnectorSync } from './github.connector';

// Registry of runnable sync functions, keyed by connector_type_id. Adding a
// new connector type means: (1) a row in connector_types (marketplace
// listing + config schema), (2) an entry here (the actual integration
// logic). Kept separate from the DB catalog so the marketplace listing
// itself is just data — installing a connector never requires a deploy,
// only running one is code.
const RUNNERS: Record<string, typeof runConnectorSync> = {
  github: runConnectorSync,
};

@Injectable()
export class ConnectorsService {
  private readonly logger = new Logger(ConnectorsService.name);

  /** Marketplace listing — not tenant-scoped, same catalog for everyone. */
  async listTypes() {
    const { rows } = await pool.query(
      `select id, name, description, config_schema, capabilities from connector_types order by name`,
    );
    return rows;
  }

  async install(
    tenantId: string,
    connectorTypeId: string,
    name: string,
    config: Record<string, any>,
    credential: string | null,
  ) {
    const { rows: typeRows } = await pool.query(
      `select id from connector_types where id = $1`,
      [connectorTypeId],
    );
    if (!typeRows[0]) {
      throw new BadRequestException(`Unknown connector type '${connectorTypeId}'`);
    }
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into connector_installs (tenant_id, connector_type_id, name, config, credential)
         values ($1, $2, $3, $4, $5)
         returning id, connector_type_id, name, config, status, last_synced_at, last_sync_result, created_at`,
        [tenantId, connectorTypeId, name, config ?? {}, credential ?? null],
      );
      return rows[0];
    });
  }

  /** Never returns `credential` — shown-once-at-install discipline, same as API keys. */
  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, connector_type_id, name, config, status, last_synced_at, last_sync_result, created_at
         from connector_installs where tenant_id = $1 order by created_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async setStatus(tenantId: string, installId: string, status: 'active' | 'disabled') {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update connector_installs set status = $2 where id = $1
         returning id, status`,
        [installId, status],
      );
      if (!rows[0]) throw new NotFoundException('Connector install not found');
      return rows[0];
    });
  }

  async remove(tenantId: string, installId: string) {
    return withTenant(tenantId, async (client) => {
      const { rowCount } = await client.query(
        `delete from connector_installs where id = $1`,
        [installId],
      );
      if (!rowCount) throw new NotFoundException('Connector install not found');
    });
  }

  async listSyncRuns(tenantId: string, installId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select id, status, items_imported, items_skipped, error, started_at, finished_at
         from connector_sync_runs where install_id = $1 order by started_at desc limit 20`,
        [installId],
      );
      return rows;
    });
  }

  /** Runs the connector's real sync now (not on a schedule — this repo has
   *  no cron/job-queue infra yet; see §11.10's job-broker limitation note
   *  for the same tradeoff made elsewhere). Forwards the caller's own
   *  bearer token to pm so ticket creation goes through real auth, same
   *  cross-service pattern used everywhere else in this build. */
  async sync(tenantId: string, installId: string, authorizationHeader: string) {
    const install = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from connector_installs where id = $1`,
        [installId],
      );
      return rows[0];
    });
    if (!install) throw new NotFoundException('Connector install not found');
    if (install.status !== 'active') {
      throw new BadRequestException('Connector is disabled');
    }

    const runner = RUNNERS[install.connector_type_id];
    if (!runner) {
      throw new BadRequestException(`No runner implemented for '${install.connector_type_id}'`);
    }

    const runId = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into connector_sync_runs (tenant_id, install_id, status) values ($1, $2, 'success') returning id`,
        [tenantId, installId],
      );
      return rows[0].id;
    });

    try {
      const result = await runner(install, authorizationHeader);
      await withTenant(tenantId, (client) =>
        client.query(
          `update connector_sync_runs set items_imported = $2, items_skipped = $3, finished_at = now() where id = $1`,
          [runId, result.imported, result.skipped],
        ),
      );
      await withTenant(tenantId, (client) =>
        client.query(
          `update connector_installs set last_synced_at = now(), last_sync_result = $2 where id = $1`,
          [installId, JSON.stringify({ status: 'success', ...result })],
        ),
      );
      return { status: 'success', ...result };
    } catch (err: any) {
      this.logger.error(`Connector sync failed for install ${installId}: ${err.message}`);
      await withTenant(tenantId, (client) =>
        client.query(
          `update connector_sync_runs set status = 'failed', error = $2, finished_at = now() where id = $1`,
          [runId, err.message],
        ),
      );
      await withTenant(tenantId, (client) =>
        client.query(
          `update connector_installs set last_synced_at = now(), last_sync_result = $2 where id = $1`,
          [installId, JSON.stringify({ status: 'failed', error: err.message })],
        ),
      );
      throw new BadRequestException(`Sync failed: ${err.message}`);
    }
  }
}
