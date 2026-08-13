import { Injectable, Logger } from '@nestjs/common';
import { mkdirSync, writeFileSync, statSync } from 'fs';
import { join } from 'path';
import { withTenant } from '../db/pool';

/**
 * Tenant offboarding ("right to leave") — enterprise buyers require this be
 * a real, tested export path before they'll sign, not a support-ticket
 * promise. Aggregates every owning service's data for one tenant into a
 * single bundle. Runs synchronously today (fine for demo-scale data); the
 * natural extension is a queued job (Kafka) once export size warrants it —
 * tracked in docs/FEATURES.md rather than built speculatively here.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger(DataExportService.name);

  private bundleDir() {
    const dir = process.env.EXPORT_BUNDLE_DIR ?? '/tmp/nexus-data-exports';
    mkdirSync(dir, { recursive: true });
    return dir;
  }

  async requestExport(tenantId: string, requestedByUserId: string, authorizationHeader: string) {
    const job = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into data_export_jobs (tenant_id, requested_by_user_id, status)
         values ($1, $2, 'processing') returning *`,
        [tenantId, requestedByUserId],
      );
      return rows[0];
    });

    // Fire-and-forget from the caller's perspective, but awaited here since
    // this build has no background job runner yet — see docs/FEATURES.md.
    this.runExport(tenantId, job.id, authorizationHeader).catch((err) => {
      this.logger.error(`export job ${job.id} failed: ${err}`);
    });

    return job;
  }

  private async runExport(tenantId: string, jobId: string, authorizationHeader: string) {
    const authServiceUrl = process.env.AUTH_SERVICE_URL ?? 'http://localhost:4001';
    const pmServiceUrl = process.env.PM_SERVICE_URL ?? 'http://localhost:4002';

    try {
      const [users, projects] = await Promise.all([
        this.fetchJson(`${authServiceUrl}/users`, authorizationHeader),
        this.fetchJson(`${pmServiceUrl}/projects`, authorizationHeader),
      ]);

      const projectTickets = await Promise.all(
        (projects as Array<{ id: string }>).map((p) =>
          this.fetchJson(`${pmServiceUrl}/tickets?projectId=${p.id}`, authorizationHeader),
        ),
      );

      const bundle = {
        exportedAt: new Date().toISOString(),
        tenantId,
        users,
        projects: (projects as Array<Record<string, unknown>>).map((p, i) => ({
          ...p,
          tickets: projectTickets[i],
        })),
        // Git repos and chat history are intentionally not inlined here —
        // repos export as their own clone bundles, chat as a separate JSONL
        // stream. This top-level manifest links to those, not built yet.
        note: 'git repo and chat-history export are tracked as 🟡 follow-ups; this bundle covers identity + PM data.',
      };

      const filePath = join(this.bundleDir(), `${tenantId}-${jobId}.json`);
      writeFileSync(filePath, JSON.stringify(bundle, null, 2));
      const { size } = statSync(filePath);

      await withTenant(tenantId, (client) =>
        client.query(
          `update data_export_jobs set status = 'completed', bundle_path = $2, bundle_size_bytes = $3, completed_at = now()
           where id = $1`,
          [jobId, filePath, size],
        ),
      );
    } catch (err) {
      await withTenant(tenantId, (client) =>
        client.query(
          `update data_export_jobs set status = 'failed', failure_reason = $2 where id = $1`,
          [jobId, String(err)],
        ),
      );
      throw err;
    }
  }

  private async fetchJson(url: string, authorizationHeader: string) {
    const res = await fetch(url, { headers: { authorization: authorizationHeader } });
    if (!res.ok) throw new Error(`fetch ${url} failed: ${res.status}`);
    return res.json();
  }

  async getJob(tenantId: string, jobId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(`select * from data_export_jobs where id = $1`, [jobId]);
      return rows[0] ?? null;
    });
  }

  async listJobs(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from data_export_jobs where tenant_id = $1 order by requested_at desc`,
        [tenantId],
      );
      return rows;
    });
  }
}
