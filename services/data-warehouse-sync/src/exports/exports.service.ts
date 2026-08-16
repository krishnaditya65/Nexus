import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { withTenant } from '../db/pool';
import { isUnsupportedWarehouseConnector, isSupportedLocalDiskConnector, buildExportFileName } from './export-destination';

/**
 * Reverse-ETL: pulls this tenant's data from the owning services and lands
 * it where the tenant's own analytics stack can pick it up. Real Snowflake/
 * BigQuery/S3 connectors are swap-in implementations of the same "write
 * rows somewhere the tenant controls" contract this demonstrates against
 * local disk — see writeToDestination for the extension point.
 */
@Injectable()
export class ExportsService {
  private readonly logger = new Logger(ExportsService.name);

  async createDestination(
    tenantId: string,
    destinationType: 'snowflake' | 'bigquery' | 's3_parquet',
    connectionConfig: Record<string, unknown>,
    scheduleCron: string,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into export_destinations (tenant_id, destination_type, connection_config, schedule_cron)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, destinationType, JSON.stringify(connectionConfig), scheduleCron],
      );
      return rows[0];
    });
  }

  async listDestinations(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from export_destinations where tenant_id = $1`, [tenantId]);
      return rows;
    });
  }

  async runExportNow(tenantId: string, destinationId: string, authorizationHeader: string) {
    const destination = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from export_destinations where id = $1`, [destinationId]);
      return rows[0] ?? null;
    });
    if (!destination) return { status: 'not_found' };

    const runId = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into export_runs (tenant_id, destination_id) values ($1, $2) returning id`,
        [tenantId, destinationId],
      );
      return rows[0].id;
    });

    try {
      // Extract: pull the tenant's PM data through pm-service's own
      // tenant-scoped API — this service never reads another service's
      // database directly, same boundary every other cross-service call in
      // this platform respects.
      const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';
      const projects = await this.fetchJson(`${pmServiceUrl}/projects`, authorizationHeader);
      const allTickets: unknown[] = [];
      for (const project of projects as Array<{ id: string }>) {
        const tickets = await this.fetchJson(
          `${pmServiceUrl}/tickets?projectId=${project.id}`,
          authorizationHeader,
        );
        allTickets.push(...(tickets as unknown[]));
      }

      // Transform + Load: the destination-specific part. Only 's3_parquet'-
      // shaped local-disk CSV is actually implemented; snowflake/bigquery
      // branches document the real integration point without faking a
      // credentialed connection this build can't make.
      const outputPath = await this.writeToDestination(tenantId, destination, allTickets);

      await withTenant(tenantId, (client) =>
        client.query(
          `update export_runs set status = 'completed', rows_exported = $2, output_path = $3, completed_at = now()
           where id = $1`,
          [runId, allTickets.length, outputPath],
        ),
      );
      return { status: 'completed', rowsExported: allTickets.length, outputPath };
    } catch (err) {
      this.logger.error(`export run ${runId} failed: ${err}`);
      await withTenant(tenantId, (client) =>
        client.query(`update export_runs set status = 'failed', error_message = $2 where id = $1`, [
          runId,
          String(err),
        ]),
      );
      return { status: 'failed', error: String(err) };
    }
  }

  private async writeToDestination(
    tenantId: string,
    destination: { destination_type: string },
    rows: unknown[],
  ): Promise<string> {
    if (isUnsupportedWarehouseConnector(destination.destination_type)) {
      throw new Error(
        `${destination.destination_type} connector not implemented in this build — ` +
          'swap this branch for the vendor SDK/driver call; extraction and run tracking above are unaffected.',
      );
    }
    if (!isSupportedLocalDiskConnector(destination.destination_type)) {
      // An unrecognized destinationType (e.g. a typo) must fail loudly —
      // it must never silently fall through to the s3_parquet local-disk
      // writer below and get reported as 'completed'.
      throw new Error(`unrecognized destinationType '${destination.destination_type}' — export cannot be written`);
    }
    const dir = process.env.WAREHOUSE_EXPORT_DIR ?? '/tmp/nexus-warehouse-exports';
    mkdirSync(dir, { recursive: true });
    const outputPath = join(dir, buildExportFileName(tenantId, Date.now()));
    writeFileSync(outputPath, JSON.stringify(rows, null, 2));
    return outputPath;
  }

  private async fetchJson(url: string, authorizationHeader: string) {
    const res = await fetch(url, { headers: { authorization: authorizationHeader } });
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    return res.json();
  }

  async listRuns(tenantId: string, destinationId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from export_runs where tenant_id = $1 and destination_id = $2 order by started_at desc`,
        [tenantId, destinationId],
      );
      return rows;
    });
  }
}
