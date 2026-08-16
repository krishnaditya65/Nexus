import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { withTenant } from '../db/pool';

const AUTO_STATUS_ON_UPDATE_KEYWORDS: Record<string, string> = {
  identified: 'identified',
  monitoring: 'monitoring',
  resolved: 'resolved',
};

// Pulled out as a standalone, exported, pure function so the actual
// paging decision is unit-testable without a database or a live
// notifications service. See incidents.service.spec.ts.
export function requiresImmediatePaging(severity: string): boolean {
  return severity === 'sev1' || severity === 'sev2';
}

@Injectable()
export class IncidentsService {
  private readonly logger = new Logger(IncidentsService.name);

  async create(
    tenantId: string,
    title: string,
    severity: 'sev1' | 'sev2' | 'sev3' | 'sev4',
    commanderUserId: string,
  ) {
    const incident = await withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into incidents (tenant_id, title, severity, commander_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, title, severity, commanderUserId],
      );
      return rows[0];
    });

    // Sev1/Sev2 pages the commander immediately via services/notifications —
    // the paging use case the original spec called out explicitly
    // ("page the on-call engineer").
    if (requiresImmediatePaging(severity)) {
      await this.pageCommander(tenantId, commanderUserId, incident);
    }

    return incident;
  }

  private async pageCommander(tenantId: string, userId: string, incident: { title: string; severity: string }) {
    try {
      const notificationsUrl = process.env.NOTIFICATIONS_SERVICE_URL ?? 'http://localhost:4014';
      await fetch(`${notificationsUrl}/internal/notifications/send`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-internal-secret': process.env.INTERNAL_SERVICE_SECRET ?? 'dev-only-internal-secret',
        },
        body: JSON.stringify({
          tenantId,
          userId,
          title: `[${incident.severity.toUpperCase()}] ${incident.title}`,
          body: 'You are the incident commander. Acknowledge in the platform.',
          category: 'incident_page',
        }),
      });
    } catch (err) {
      this.logger.error(`failed to page incident commander: ${err}`);
    }
  }

  async postUpdate(tenantId: string, incidentId: string, message: string, postedByUserId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into incident_updates (tenant_id, incident_id, message, posted_by_user_id)
         values ($1, $2, $3, $4) returning *`,
        [tenantId, incidentId, message, postedByUserId],
      );

      const lowerMessage = message.toLowerCase();
      for (const [keyword, status] of Object.entries(AUTO_STATUS_ON_UPDATE_KEYWORDS)) {
        // Word-boundary match, not a plain substring check — `.includes()`
        // false-positives on phrases like "still not resolved" (contains
        // "resolved") and would wrongly auto-close the incident.
        if (new RegExp(`\\b${keyword}\\b`, 'i').test(lowerMessage)) {
          await client.query(
            `update incidents set status = $2, resolved_at = case when $2 = 'resolved' then now() else resolved_at end
             where id = $1`,
            [incidentId, status],
          );
          break;
        }
      }

      return rows[0];
    });
  }

  async resolve(tenantId: string, incidentId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `update incidents set status = 'resolved', resolved_at = now() where id = $1 returning *`,
        [incidentId],
      );
      if (!rows[0]) throw new NotFoundException('Incident not found');
      return rows[0];
    });
  }

  async get(tenantId: string, incidentId: string) {
    return withTenant(tenantId, async (client) => {
      const incidentRes = await client.query(`select * from incidents where id = $1`, [incidentId]);
      if (!incidentRes.rows[0]) throw new NotFoundException('Incident not found');
      const updatesRes = await client.query(
        `select * from incident_updates where incident_id = $1 order by posted_at`,
        [incidentId],
      );
      return { ...incidentRes.rows[0], updates: updatesRes.rows };
    });
  }

  async list(tenantId: string) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `select * from incidents where tenant_id = $1 order by started_at desc`,
        [tenantId],
      );
      return rows;
    });
  }

  async publishPostmortem(
    tenantId: string,
    incidentId: string,
    summary: string,
    rootCause: string,
    actionItems: Array<{ description: string; ownerUserId?: string }>,
  ) {
    return withTenant(tenantId, async (client) => {
      const { rows } = await client.query(
        `insert into postmortems (tenant_id, incident_id, summary, root_cause, action_items, published_at)
         values ($1, $2, $3, $4, $5, now())
         on conflict (incident_id) do update
           set summary = excluded.summary, root_cause = excluded.root_cause,
               action_items = excluded.action_items, published_at = now()
         returning *`,
        [
          tenantId,
          incidentId,
          summary,
          rootCause,
          JSON.stringify(actionItems.map((item) => ({ ...item, status: 'open' }))),
        ],
      );
      return rows[0];
    });
  }
}
